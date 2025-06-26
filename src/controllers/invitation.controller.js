const InvitationService = require('../services/invitation.service');
const supabase = require('../config/supabase');

/**
 * Create a new invitation code
 * POST /api/invitations/create
 */
const createInvitation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { invitee_email } = req.body;

    // Get user info for response
    const { data: user } = await supabase
      .from('users')
      .select('id, email, member_id')
      .eq('id', userId)
      .single();

    const result = await InvitationService.createInvitation(userId, invitee_email);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: result.error,
          message: getErrorMessage(result.error),
          details: result.details
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        invitation: {
          id: result.data.id,
          code: result.data.code,
          expires_at: result.data.expires_at,
          invitee_email: result.data.invitee_email,
          share_url: `${process.env.FRONTEND_URL}/invite/${result.data.code}`,
          inviter: {
            member_id: user.member_id,
            email: user.email
          }
        }
      }
    });
  } catch (error) {
    console.error('Create invitation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to create invitation'
      }
    });
  }
};

/**
 * Validate invitation code (check if valid without using it)
 * GET /api/invitations/validate/:code
 */
const validateInvitation = async (req, res) => {
  try {
    const { code } = req.params;

    // Expire old invitations first
    await supabase.rpc('expire_old_invitations');

    // Get invitation with inviter details
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
      return res.status(404).json({
        success: false,
        error: {
          code: 'INVALID_CODE',
          message: 'Invalid invitation code'
        }
      });
    }

    // Check status
    if (invitation.status === 'used') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CODE_ALREADY_USED',
          message: 'This invitation code has already been used'
        }
      });
    }

    if (invitation.status === 'expired' || new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CODE_EXPIRED',
          message: 'This invitation code has expired'
        }
      });
    }

    // Calculate time remaining
    const expiresAt = new Date(invitation.expires_at);
    const now = new Date();
    const hoursRemaining = Math.floor((expiresAt - now) / (1000 * 60 * 60));
    const minutesRemaining = Math.floor(((expiresAt - now) % (1000 * 60 * 60)) / (1000 * 60));

    res.status(200).json({
      success: true,
      data: {
        valid: true,
        code: invitation.code,
        inviter: {
          member_id: invitation.inviter.member_id,
          name: `${invitation.inviter.first_name} ${invitation.inviter.last_name}`,
          initial: invitation.inviter.first_name?.charAt(0).toUpperCase()
        },
        expires_at: invitation.expires_at,
        time_remaining: {
          hours: hoursRemaining,
          minutes: minutesRemaining,
          display: `${hoursRemaining}h ${minutesRemaining}m`
        }
      }
    });
  } catch (error) {
    console.error('Validate invitation error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to validate invitation'
      }
    });
  }
};

/**
 * Get user's invitation history and stats
 * GET /api/invitations/my-invitations
 */
const getMyInvitations = async (req, res) => {
  try {
    const userId = req.user.id;

    const data = await InvitationService.getUserInvitations(userId);

    // Format invitations for response
    const formattedInvitations = data.invitations.map(inv => ({
      id: inv.id,
      code: inv.code,
      status: inv.status,
      created_at: inv.created_at,
      expires_at: inv.expires_at,
      used_at: inv.used_at,
      share_url: `${process.env.FRONTEND_URL}/invite/${inv.code}`,
      invitee: inv.invitee ? {
        member_id: inv.invitee.member_id,
        name: `${inv.invitee.first_name} ${inv.invitee.last_name}`,
        joined_at: inv.invitee.created_at
      } : null
    }));

    res.status(200).json({
      success: true,
      data: {
        invitations: formattedInvitations,
        stats: data.stats,
        metrics: data.metrics,
        remaining_today: data.stats.daily_invite_limit - 
          (data.invitations.filter(inv => {
            const invDate = new Date(inv.created_at);
            const today = new Date();
            return invDate.toDateString() === today.toDateString();
          }).length || 0)
      }
    });
  } catch (error) {
    console.error('Get my invitations error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch invitations'
      }
    });
  }
};

/**
 * Get user's invitation network (who they invited and sub-invites)
 * GET /api/invitations/network
 */
const getInvitationNetwork = async (req, res) => {
  try {
    const userId = req.user.id;
    const { depth = 2 } = req.query;

    const network = await InvitationService.getInvitationNetwork(
      userId, 
      Math.min(parseInt(depth), 5) // Max depth of 5
    );

    res.status(200).json({
      success: true,
      data: {
        network
      }
    });
  } catch (error) {
    console.error('Get invitation network error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch invitation network'
      }
    });
  }
};

/**
 * Get viral metrics (admin endpoint)
 * GET /api/invitations/metrics
 */
const getViralMetrics = async (req, res) => {
  try {
    // TODO: Add admin authentication check
    const { timeframe = '7d' } = req.query;

    const metrics = await InvitationService.getViralMetrics(timeframe);

    res.status(200).json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Get viral metrics error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to fetch viral metrics'
      }
    });
  }
};

/**
 * Track share click
 * POST /api/invitations/track-share
 */
const trackShare = async (req, res) => {
  try {
    const userId = req.user.id;
    const { platform, invitation_code } = req.body;

    // Find invitation by code if provided
    let invitationId = null;
    if (invitation_code) {
      const { data: invitation } = await supabase
        .from('invitations')
        .select('id')
        .eq('code', invitation_code)
        .single();
      
      invitationId = invitation?.id;
    }

    // Track the share action
    await supabase
      .from('viral_tracking')
      .insert({
        user_id: userId,
        action_type: 'share_clicked',
        invitation_id: invitationId,
        metadata: {
          platform,
          timestamp: new Date().toISOString()
        }
      });

    res.status(200).json({
      success: true,
      data: {
        tracked: true
      }
    });
  } catch (error) {
    console.error('Track share error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to track share'
      }
    });
  }
};

/**
 * Helper function to get user-friendly error messages
 */
const getErrorMessage = (errorCode) => {
  const messages = {
    'LIFETIME_LIMIT_REACHED': 'You have reached your lifetime invitation limit',
    'DAILY_LIMIT_REACHED': 'You have reached your daily invitation limit. Try again tomorrow.',
    'INVALID_CODE': 'Invalid invitation code',
    'CODE_ALREADY_USED': 'This invitation code has already been used',
    'CODE_EXPIRED': 'This invitation code has expired'
  };
  
  return messages[errorCode] || 'An error occurred while processing your request';
};

module.exports = {
  createInvitation,
  validateInvitation,
  getMyInvitations,
  getInvitationNetwork,
  getViralMetrics,
  trackShare
}; 