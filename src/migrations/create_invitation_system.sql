-- Create invitation system tables

-- Add member_id and invitation metadata to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS member_id VARCHAR(20) UNIQUE,
ADD COLUMN IF NOT EXISTS invited_by_user_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS invitation_code_used VARCHAR(10),
ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS is_founding_member BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS access_tier VARCHAR(20) DEFAULT 'STANDARD';

-- Create index on member_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_member_id ON users(member_id);

-- Create invitations table
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(10) UNIQUE NOT NULL,
    inviter_user_id UUID NOT NULL REFERENCES users(id),
    invitee_user_id UUID REFERENCES users(id),
    invitee_email VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, used, expired
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    CONSTRAINT check_status CHECK (status IN ('pending', 'used', 'expired'))
);

-- Create indexes for invitations
CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(code);
CREATE INDEX IF NOT EXISTS idx_invitations_inviter ON invitations(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);
CREATE INDEX IF NOT EXISTS idx_invitations_expires_at ON invitations(expires_at);

-- Create invitation_stats table for tracking
CREATE TABLE IF NOT EXISTS invitation_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    total_invites_sent INTEGER DEFAULT 0,
    total_invites_used INTEGER DEFAULT 0,
    daily_invite_limit INTEGER DEFAULT 3,
    lifetime_invite_limit INTEGER DEFAULT 50,
    last_invite_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_stats UNIQUE(user_id)
);

-- Create viral tracking table
CREATE TABLE IF NOT EXISTS viral_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL, -- invite_sent, invite_accepted, share_clicked
    target_user_id UUID REFERENCES users(id),
    invitation_id UUID REFERENCES invitations(id),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for viral tracking
CREATE INDEX IF NOT EXISTS idx_viral_tracking_user_id ON viral_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_viral_tracking_action_type ON viral_tracking(action_type);
CREATE INDEX IF NOT EXISTS idx_viral_tracking_created_at ON viral_tracking(created_at);

-- Create function to generate unique member IDs
CREATE OR REPLACE FUNCTION generate_member_id() RETURNS VARCHAR AS $$
DECLARE
    new_id VARCHAR(20);
    exists_count INTEGER;
BEGIN
    LOOP
        -- Generate ID in format SUBJECT-XXXX where X is alphanumeric
        new_id := 'SUBJECT-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 4));
        
        -- Check if it already exists
        SELECT COUNT(*) INTO exists_count FROM users WHERE member_id = new_id;
        
        -- If unique, return it
        IF exists_count = 0 THEN
            RETURN new_id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Create function to expire old invitations
CREATE OR REPLACE FUNCTION expire_old_invitations() RETURNS void AS $$
BEGIN
    UPDATE invitations 
    SET status = 'expired' 
    WHERE status = 'pending' 
    AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update member_id on user creation
CREATE OR REPLACE FUNCTION set_member_id() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.member_id IS NULL THEN
        NEW.member_id := generate_member_id();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_member_id
BEFORE INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION set_member_id();

-- Create trigger to update invitation stats
CREATE OR REPLACE FUNCTION update_invitation_stats() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Initialize stats for new invitation sender if not exists
        INSERT INTO invitation_stats (user_id, total_invites_sent, last_invite_sent_at)
        VALUES (NEW.inviter_user_id, 1, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET total_invites_sent = invitation_stats.total_invites_sent + 1,
            last_invite_sent_at = NOW(),
            updated_at = NOW();
    ELSIF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'used' THEN
        -- Update stats when invitation is used
        UPDATE invitation_stats
        SET total_invites_used = total_invites_used + 1,
            updated_at = NOW()
        WHERE user_id = NEW.inviter_user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_invitation_stats
AFTER INSERT OR UPDATE ON invitations
FOR EACH ROW
EXECUTE FUNCTION update_invitation_stats();

-- Add RLS policies
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitation_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_tracking ENABLE ROW LEVEL SECURITY;

-- Invitation policies
CREATE POLICY "Users can view their own invitations" ON invitations
    FOR SELECT USING (inviter_user_id = auth.uid() OR invitee_user_id = auth.uid());

CREATE POLICY "Users can create invitations" ON invitations
    FOR INSERT WITH CHECK (inviter_user_id = auth.uid());

-- Stats policies
CREATE POLICY "Users can view their own stats" ON invitation_stats
    FOR SELECT USING (user_id = auth.uid());

-- Viral tracking policies
CREATE POLICY "Users can view their own viral tracking" ON viral_tracking
    FOR SELECT USING (user_id = auth.uid()); 