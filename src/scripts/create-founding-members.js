require('dotenv').config();
const supabase = require('../config/supabase');
const bcrypt = require('bcryptjs');

/**
 * Script to create initial founding members
 * These users get special privileges and higher invitation limits
 */

const foundingMembers = [
  {
    email: 'founder1@example.com',
    first_name: 'John',
    last_name: 'Doe',
    password: 'temp_password_123', // They should change this
    daily_invite_limit: 10,
    lifetime_invite_limit: 500
  },
  // Add more founding members here
];

async function createFoundingMembers() {
  console.log('🚀 Creating founding members...');

  for (const member of foundingMembers) {
    try {
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', member.email.toLowerCase())
        .single();

      if (existingUser) {
        console.log(`⚠️ User ${member.email} already exists, skipping...`);
        continue;
      }

      // Hash password (same as registration flow)
      const hashedPassword = await bcrypt.hash(member.password, 10);

      // Generate unique FOUNDER member ID
      const generateFounderMemberId = () => {
        return 'FOUNDER-' + Math.random().toString(36).substr(2, 4).toUpperCase();
      };

      // Insert directly into users table (consistent with auth system)
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          email: member.email.toLowerCase(),
          password_hash: hashedPassword,
          first_name: member.first_name,
          last_name: member.last_name,
          member_id: generateFounderMemberId(), // Custom FOUNDER- prefix
          is_founding_member: true,
          access_tier: 'FOUNDER',
          is_verified: true,
          is_active: true,
          profile_completed: true
        })
        .select('id, member_id')
        .single();

      if (insertError) {
        console.error(`❌ Failed to create user ${member.email}:`, insertError);
        continue;
      }

      // Set custom invitation limits
      const { error: statsError } = await supabase
        .from('invitation_stats')
        .insert({
          user_id: newUser.id,
          daily_invite_limit: member.daily_invite_limit,
          lifetime_invite_limit: member.lifetime_invite_limit
        });

      if (statsError) {
        console.error(`❌ Failed to set invitation stats for ${member.email}:`, statsError);
        continue;
      }

      console.log(`✅ Created founding member: ${member.email} (${newUser.member_id}) with ID: ${newUser.id}`);
      
    } catch (error) {
      console.error(`❌ Error creating ${member.email}:`, error);
    }
  }

  console.log('✨ Founding members creation complete!');
}

// Run the script
if (require.main === module) {
  createFoundingMembers()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

module.exports = { createFoundingMembers }; 