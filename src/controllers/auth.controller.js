const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const InvitationService = require('../services/invitation.service');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
};

// Register new user
const register = async (req, res) => {
  try {
    const { email, password, first_name, last_name, invitation_code } = req.body;

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: {
            email: 'Email already exists'
          }
        }
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Validate invitation code if provided
    let invitationData = null;
    let inviterUserId = null;
    
    if (invitation_code) {
      // Check if code is valid
      const validationResult = await InvitationService.useInvitation(invitation_code, null);
      
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: {
              invitation_code: validationResult.message
            }
          }
        });
      }
      
      invitationData = validationResult.data;
      inviterUserId = invitationData.invitation.inviter_user_id;
    }

    // Create user
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash: hashedPassword,
        first_name,
        last_name,
        is_verified: false,
        is_active: true,
        profile_completed: false,
        invited_by_user_id: inviterUserId,
        invitation_code_used: invitation_code,
        access_tier: invitation_code ? 'INVITED' : 'STANDARD'
      })
      .select('id, email, first_name, last_name, created_at, member_id')
      .single();

    if (createError) {
      throw createError;
    }

    // If invitation code was used, mark it as used with the new user ID
    if (invitation_code && invitationData) {
      await InvitationService.useInvitation(invitation_code, newUser.id);
    }

    // Generate token
    const token = generateToken(newUser.id);

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          first_name: newUser.first_name,
          last_name: newUser.last_name,
          member_id: newUser.member_id,
          created_at: newUser.created_at,
          was_invited: !!invitation_code,
          inviter: invitationData ? {
            member_id: invitationData.inviter.member_id,
            name: `${invitationData.inviter.first_name} ${invitationData.inviter.last_name}`
          } : null
        }
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to register user'
      }
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Get user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid email or password'
        }
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Account is deactivated'
        }
      });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid email or password'
        }
      });
    }

    // Generate token
    const token = generateToken(user.id);

    // Create session
    await supabase
      .from('user_sessions')
      .insert({
        user_id: user.id,
        token_hash: await bcrypt.hash(token, 10),
        device_info: {
          user_agent: req.headers['user-agent'],
          platform: req.headers['platform']
        },
        ip_address: req.ip,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        is_active: true
      });

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          member_id: user.member_id
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to login'
      }
    });
  }
};

// Logout user
const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      // Invalidate session
      const hashedToken = await bcrypt.hash(token, 10);
      await supabase
        .from('user_sessions')
        .update({ is_active: false })
        .eq('token_hash', hashedToken);
    }

    res.status(200).json({
      success: true,
      data: {
        message: 'Logged out successfully'
      }
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to logout'
      }
    });
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'No token provided'
        }
      });
    }

    const oldToken = authHeader.split(' ')[1];

    try {
      // Verify old token (even if expired)
      const decoded = jwt.verify(oldToken, process.env.JWT_SECRET, { ignoreExpiration: true });
      
      // Check if user still exists and is active
      const { data: user, error } = await supabase
        .from('users')
        .select('id, is_active')
        .eq('id', decoded.userId)
        .single();

      if (error || !user || !user.is_active) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_ERROR',
            message: 'Invalid token'
          }
        });
      }

      // Generate new token
      const newToken = generateToken(user.id);

      res.status(200).json({
        success: true,
        data: {
          token: newToken
        }
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Invalid token'
        }
      });
    }
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to refresh token'
      }
    });
  }
};

// Verify email
const verifyEmail = async (req, res) => {
  // TODO: Implement email verification
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Email verification not implemented'
    }
  });
};

// Forgot password
const forgotPassword = async (req, res) => {
  // TODO: Implement forgot password
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Forgot password not implemented'
    }
  });
};

// Reset password
const resetPassword = async (req, res) => {
  // TODO: Implement reset password
  res.status(501).json({
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Reset password not implemented'
    }
  });
};

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  verifyEmail,
  forgotPassword,
  resetPassword
}; 