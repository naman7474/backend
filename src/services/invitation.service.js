const crypto = require('crypto');
const supabase = require('../config/supabase');

class InvitationService {
  /**
   * Generate a unique invitation code
   * Format: XXXX-YYYY (8 characters, alphanumeric)
   */
  static generateInviteCode() {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    // Generate 8 random characters
    for (let i = 0; i < 8; i++) {
      if (i === 4) code += '-'; // Add dash in the middle
      code += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return code;
  }

  /**
   * Check if user can send more invitations
   */
  static async canSendInvitation(userId) {
    try {
      // Get user's invitation stats
      const { data: stats, error } = await supabase
        .from('invitation_stats')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }

      // If no stats exist, user can send invitations
      if (!stats) {
        return { canSend: true, reason: null };
      }

      // Check lifetime limit
      if (stats.total_invites_sent >= stats.lifetime_invite_limit) {
        return { 
          canSend: false, 
          reason: 'LIFETIME_LIMIT_REACHED',
          limit: stats.lifetime_invite_limit 
        };
      }

      // Check daily limit
      if (stats.last_invite_sent_at) {
        const lastInviteDate = new Date(stats.last_invite_sent_at);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        lastInviteDate.setHours(0, 0, 0, 0);

        if (lastInviteDate.getTime() === today.getTime()) {
          // Count invitations sent today
          const { count } = await supabase
            .from('invitations')
            .select('*', { count: 'exact', head: true })
            .eq('inviter_user_id', userId)
            .gte('created_at', today.toISOString());

          if (count >= stats.daily_invite_limit) {
            return { 
              canSend: false, 
              reason: 'DAILY_LIMIT_REACHED',
              limit: stats.daily_invite_limit,
              resetsAt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            };
          }
        }
      }

      return { canSend: true, reason: null };
    } catch (error) {
      console.error('Error checking invitation limit:', error);
      throw error;
    }
  }

  /**
   * Create a new invitation
   */
  static async createInvitation(inviterUserId, inviteeEmail = null) {
    try {
      // Check if user can send invitation
      const canSend = await this.canSendInvitation(inviterUserId);
      if (!canSend.canSend) {
        return { 
          success: false, 
          error: canSend.reason,
          details: canSend 
        };
      }

      // Generate unique code
      let code;
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        code = this.generateInviteCode();
        
        // Check if code already exists
        const { data: existing } = await supabase
          .from('invitations')
          .select('id')
          .eq('code', code)
          .single();

        if (!existing) break;
        attempts++;
      }

      if (attempts === maxAttempts) {
        throw new Error('Failed to generate unique invitation code');
      }

      // Create invitation with 48-hour expiration
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      const { data: invitation, error } = await supabase
        .from('invitations')
        .insert({
          code,
          inviter_user_id: inviterUserId,
          invitee_email: inviteeEmail,
          expires_at: expiresAt.toISOString(),
          metadata: {
            created_at_timestamp: Date.now(),
            expires_at_timestamp: expiresAt.getTime()
          }
        })
        .select()
        .single();

      if (error) throw error;

      // Track viral action
      await supabase
        .from('viral_tracking')
        .insert({
          user_id: inviterUserId,
          action_type: 'invite_sent',
          invitation_id: invitation.id,
          metadata: {
            code: code,
            invitee_email: inviteeEmail
          }
        });

      return { 
        success: true, 
        data: invitation 
      };
    } catch (error) {
      console.error('Error creating invitation:', error);
      throw error;
    }
  }

  /**
   * Validate and use an invitation code
   */
  static async useInvitation(code, userId) {
    try {
      // Expire old invitations first
      await supabase.rpc('expire_old_invitations');

      // Get invitation
      const { data: invitation, error } = await supabase
        .from('invitations')
        .select(`
          *,
          inviter:inviter_user_id (
            id,
            email,
            first_name,
            last_name,
            member_id
          )
        `)
        .eq('code', code)
        .single();

      if (error || !invitation) {
        return { 
          success: false, 
          error: 'INVALID_CODE',
          message: 'Invalid invitation code' 
        };
      }

      // Check if already used
      if (invitation.status === 'used') {
        return { 
          success: false, 
          error: 'CODE_ALREADY_USED',
          message: 'This invitation code has already been used' 
        };
      }

      // Check if expired
      if (invitation.status === 'expired' || new Date(invitation.expires_at) < new Date()) {
        return { 
          success: false, 
          error: 'CODE_EXPIRED',
          message: 'This invitation code has expired' 
        };
      }

      // Mark invitation as used
      const { error: updateError } = await supabase
        .from('invitations')
        .update({
          status: 'used',
          used_at: new Date().toISOString(),
          invitee_user_id: userId
        })
        .eq('id', invitation.id);

      if (updateError) throw updateError;

      // Update user with invitation details
      await supabase
        .from('users')
        .update({
          invited_by_user_id: invitation.inviter_user_id,
          invitation_code_used: code
        })
        .eq('id', userId);

      // Track viral action
      await supabase
        .from('viral_tracking')
        .insert({
          user_id: invitation.inviter_user_id,
          action_type: 'invite_accepted',
          target_user_id: userId,
          invitation_id: invitation.id,
          metadata: {
            code: code
          }
        });

      return { 
        success: true, 
        data: {
          invitation,
          inviter: invitation.inviter
        }
      };
    } catch (error) {
      console.error('Error using invitation:', error);
      throw error;
    }
  }

  /**
   * Get user's invitation history
   */
  static async getUserInvitations(userId) {
    try {
      // Get invitations sent by user
      const { data: sentInvitations, error: sentError } = await supabase
        .from('invitations')
        .select(`
          *,
          invitee:invitee_user_id (
            id,
            email,
            first_name,
            last_name,
            member_id,
            created_at
          )
        `)
        .eq('inviter_user_id', userId)
        .order('created_at', { ascending: false });

      if (sentError) throw sentError;

      // Get user's stats
      const { data: stats } = await supabase
        .from('invitation_stats')
        .select('*')
        .eq('user_id', userId)
        .single();

      // Get user's viral coefficient (how many successful invites)
      const successfulInvites = sentInvitations?.filter(inv => inv.status === 'used') || [];
      const viralCoefficient = sentInvitations?.length > 0 
        ? (successfulInvites.length / sentInvitations.length) 
        : 0;

      return {
        invitations: sentInvitations || [],
        stats: stats || {
          total_invites_sent: 0,
          total_invites_used: 0,
          daily_invite_limit: 3,
          lifetime_invite_limit: 50
        },
        metrics: {
          total_sent: sentInvitations?.length || 0,
          total_accepted: successfulInvites.length,
          total_pending: sentInvitations?.filter(inv => inv.status === 'pending').length || 0,
          total_expired: sentInvitations?.filter(inv => inv.status === 'expired').length || 0,
          viral_coefficient: viralCoefficient,
          success_rate: viralCoefficient * 100
        }
      };
    } catch (error) {
      console.error('Error fetching user invitations:', error);
      throw error;
    }
  }

  /**
   * Get network tree (who invited whom)
   */
  static async getInvitationNetwork(userId, depth = 2) {
    try {
      const network = { user: null, invitees: [] };

      // Get user info
      const { data: user } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, member_id, created_at')
        .eq('id', userId)
        .single();

      if (!user) return network;

      network.user = user;

      // Recursive function to build network tree
      const buildNetwork = async (parentUserId, currentDepth) => {
        if (currentDepth > depth) return [];

        const { data: invitees } = await supabase
          .from('users')
          .select('id, email, first_name, last_name, member_id, created_at')
          .eq('invited_by_user_id', parentUserId);

        if (!invitees || invitees.length === 0) return [];

        const inviteeNetwork = [];
        for (const invitee of invitees) {
          const subNetwork = await buildNetwork(invitee.id, currentDepth + 1);
          inviteeNetwork.push({
            ...invitee,
            invitees: subNetwork
          });
        }

        return inviteeNetwork;
      };

      network.invitees = await buildNetwork(userId, 1);

      return network;
    } catch (error) {
      console.error('Error building invitation network:', error);
      throw error;
    }
  }

  /**
   * Get viral metrics for analytics
   */
  static async getViralMetrics(timeframe = '7d') {
    try {
      const timeframes = {
        '24h': 1,
        '7d': 7,
        '30d': 30,
        'all': null
      };

      const days = timeframes[timeframe];
      let dateFilter = null;

      if (days) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        dateFilter = startDate.toISOString();
      }

      // Build query
      let query = supabase
        .from('viral_tracking')
        .select('*', { count: 'exact' });

      if (dateFilter) {
        query = query.gte('created_at', dateFilter);
      }

      const { data: tracking, count } = await query;

      // Calculate metrics
      const invitesSent = tracking?.filter(t => t.action_type === 'invite_sent').length || 0;
      const invitesAccepted = tracking?.filter(t => t.action_type === 'invite_accepted').length || 0;
      const sharesClicked = tracking?.filter(t => t.action_type === 'share_clicked').length || 0;

      return {
        timeframe,
        metrics: {
          total_actions: count || 0,
          invites_sent: invitesSent,
          invites_accepted: invitesAccepted,
          shares_clicked: sharesClicked,
          conversion_rate: invitesSent > 0 ? (invitesAccepted / invitesSent) * 100 : 0,
          viral_coefficient: invitesAccepted / (invitesSent || 1)
        },
        daily_breakdown: await this.getDailyBreakdown(dateFilter)
      };
    } catch (error) {
      console.error('Error fetching viral metrics:', error);
      throw error;
    }
  }

  /**
   * Get daily breakdown of viral metrics
   */
  static async getDailyBreakdown(startDate) {
    try {
      let query = supabase
        .from('viral_tracking')
        .select('created_at, action_type');

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      const { data: tracking } = await query;

      if (!tracking) return [];

      // Group by date and action type
      const breakdown = {};
      tracking.forEach(track => {
        const date = new Date(track.created_at).toISOString().split('T')[0];
        if (!breakdown[date]) {
          breakdown[date] = {
            date,
            invites_sent: 0,
            invites_accepted: 0,
            shares_clicked: 0
          };
        }

        switch (track.action_type) {
          case 'invite_sent':
            breakdown[date].invites_sent++;
            break;
          case 'invite_accepted':
            breakdown[date].invites_accepted++;
            break;
          case 'share_clicked':
            breakdown[date].shares_clicked++;
            break;
        }
      });

      return Object.values(breakdown).sort((a, b) => 
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    } catch (error) {
      console.error('Error getting daily breakdown:', error);
      return [];
    }
  }
}

module.exports = InvitationService; 