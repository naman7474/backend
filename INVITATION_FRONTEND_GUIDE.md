# Invitation System - Frontend Implementation Guide

## Overview

This guide provides implementation examples for integrating the invitation system into your frontend, following the exclusive access design philosophy from the landing.md document.

## Key Features to Implement

1. **Invitation Code Entry** - "Access Terminal" style interface
2. **Member Dashboard** - Display member ID (e.g., "SUBJECT-7829")
3. **Invitation Management** - Create and share codes
4. **Social Proof** - Show "Invited by MEMBER-4521"
5. **Viral Tracking** - Track share clicks
6. **Network Visualization** - Show invitation tree

## Implementation Examples

### 1. Registration with Invitation Code

```javascript
// Register with invitation code
const registerWithInvite = async (userData) => {
  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: userData.email,
        password: userData.password,
        first_name: userData.firstName,
        last_name: userData.lastName,
        invitation_code: userData.invitationCode // Optional
      })
    });

    const data = await response.json();
    
    if (data.success) {
      // Store token
      localStorage.setItem('token', data.data.token);
      
      // Show welcome message with inviter info
      if (data.data.user.was_invited) {
        showExclusiveWelcome({
          memberId: data.data.user.member_id,
          inviter: data.data.user.inviter
        });
      }
    }
  } catch (error) {
    console.error('Registration failed:', error);
  }
};
```

### 2. Invitation Code Validation (Access Terminal)

```javascript
// Validate invitation code before registration
const validateInviteCode = async (code) => {
  try {
    const response = await fetch(`/api/invitations/validate/${code}`);
    const data = await response.json();
    
    if (data.success) {
      // Show exclusive access granted UI
      showAccessGranted({
        inviter: data.data.inviter,
        timeRemaining: data.data.time_remaining,
        expiresAt: data.data.expires_at
      });
      
      return true;
    } else {
      // Show access denied UI
      showAccessDenied(data.error.message);
      return false;
    }
  } catch (error) {
    console.error('Validation failed:', error);
    return false;
  }
};

// Access Terminal UI Component
const AccessTerminal = () => {
  const [code, setCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [accessStatus, setAccessStatus] = useState(null);

  const handleValidate = async () => {
    setValidating(true);
    // Add dramatic delay for effect
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const isValid = await validateInviteCode(code);
    setAccessStatus(isValid ? 'GRANTED' : 'DENIED');
    setValidating(false);
  };

  return (
    <div className="access-terminal">
      <h2>SECURITY CLEARANCE REQUIRED</h2>
      <div className="terminal-input">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ENTER ACCESS CODE"
          maxLength="9"
          pattern="[A-Z0-9]{4}-[A-Z0-9]{4}"
        />
        <button onClick={handleValidate} disabled={validating}>
          {validating ? 'VERIFYING...' : 'INITIATE SCAN'}
        </button>
      </div>
      {accessStatus && (
        <div className={`access-status ${accessStatus.toLowerCase()}`}>
          ACCESS {accessStatus}
        </div>
      )}
    </div>
  );
};
```

### 3. Create and Share Invitations

```javascript
// Create invitation component
const InvitationCreator = () => {
  const [invitation, setInvitation] = useState(null);
  const [creating, setCreating] = useState(false);

  const createInvitation = async () => {
    setCreating(true);
    
    try {
      const response = await fetch('/api/invitations/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invitee_email: null // Optional email
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setInvitation(data.data.invitation);
        // Track invitation creation
        trackEvent('invitation_created', { code: data.data.invitation.code });
      } else {
        // Handle limits
        if (data.error.code === 'DAILY_LIMIT_REACHED') {
          showLimitReached(data.error.details.resetsAt);
        }
      }
    } catch (error) {
      console.error('Failed to create invitation:', error);
    } finally {
      setCreating(false);
    }
  };

  const shareInvitation = async (platform) => {
    // Track share click
    await fetch('/api/invitations/track-share', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        platform,
        invitation_code: invitation.code
      })
    });

    // Share logic
    const shareUrl = invitation.share_url;
    const shareText = `You've been granted exclusive access to our AI skincare analysis. Use code: ${invitation.code}`;

    switch (platform) {
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`);
        break;
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`);
        break;
      case 'copy':
        navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        showCopiedNotification();
        break;
    }
  };

  return (
    <div className="invitation-creator">
      {!invitation ? (
        <button 
          onClick={createInvitation} 
          disabled={creating}
          className="create-invite-btn"
        >
          {creating ? 'GENERATING ACCESS CODE...' : 'GENERATE INVITATION CODE'}
        </button>
      ) : (
        <div className="invitation-display">
          <h3>CLASSIFIED ACCESS CODE</h3>
          <div className="code-display">{invitation.code}</div>
          <div className="expiry-timer">
            EXPIRES IN: <CountdownTimer targetDate={invitation.expires_at} />
          </div>
          <div className="share-buttons">
            <button onClick={() => shareInvitation('twitter')}>
              SHARE ON X
            </button>
            <button onClick={() => shareInvitation('whatsapp')}>
              SHARE ON WHATSAPP
            </button>
            <button onClick={() => shareInvitation('copy')}>
              COPY LINK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
```

### 4. Display Invitation Stats and History

```javascript
// User's invitation dashboard
const InvitationDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvitationData();
  }, []);

  const fetchInvitationData = async () => {
    try {
      const response = await fetch('/api/invitations/my-invitations', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const result = await response.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch invitations:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">ACCESSING CLASSIFIED DATA...</div>;

  return (
    <div className="invitation-dashboard">
      <div className="stats-grid">
        <div className="stat-card">
          <h4>INVITATIONS SENT</h4>
          <div className="stat-value">{data.metrics.total_sent}</div>
        </div>
        <div className="stat-card">
          <h4>SUBJECTS RECRUITED</h4>
          <div className="stat-value">{data.metrics.total_accepted}</div>
        </div>
        <div className="stat-card">
          <h4>SUCCESS RATE</h4>
          <div className="stat-value">{data.metrics.success_rate.toFixed(1)}%</div>
        </div>
        <div className="stat-card">
          <h4>REMAINING TODAY</h4>
          <div className="stat-value">{data.remaining_today}/3</div>
        </div>
      </div>

      <div className="invitation-list">
        <h3>RECRUITMENT HISTORY</h3>
        {data.invitations.map(inv => (
          <div key={inv.id} className={`invitation-item ${inv.status}`}>
            <div className="code">{inv.code}</div>
            <div className="status">{inv.status.toUpperCase()}</div>
            {inv.invitee && (
              <div className="invitee">
                RECRUITED: {inv.invitee.member_id}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
```

### 5. Network Visualization

```javascript
// Invitation network tree visualization
const NetworkVisualization = () => {
  const [network, setNetwork] = useState(null);

  useEffect(() => {
    fetchNetwork();
  }, []);

  const fetchNetwork = async () => {
    try {
      const response = await fetch('/api/invitations/network?depth=3', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setNetwork(data.data.network);
      }
    } catch (error) {
      console.error('Failed to fetch network:', error);
    }
  };

  const renderNode = (node, level = 0) => {
    return (
      <div key={node.id} className={`network-node level-${level}`}>
        <div className="member-badge">
          <div className="member-id">{node.member_id}</div>
          <div className="member-email">{node.email}</div>
        </div>
        {node.invitees && node.invitees.length > 0 && (
          <div className="sub-network">
            {node.invitees.map(invitee => renderNode(invitee, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="network-visualization">
      <h2>YOUR RECRUITMENT NETWORK</h2>
      {network && renderNode(network.user)}
    </div>
  );
};
```

## UI/UX Recommendations

### 1. Access Terminal Design
```css
.access-terminal {
  background: #0A0A0B;
  border: 1px solid #6B46FF;
  padding: 2rem;
  font-family: 'JetBrains Mono', monospace;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.access-terminal::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #6B46FF, transparent);
  animation: scan 3s infinite;
}

@keyframes scan {
  to { left: 100%; }
}

.terminal-input input {
  background: transparent;
  border: 1px solid #6B46FF;
  color: #00D4FF;
  padding: 1rem;
  font-size: 1.2rem;
  letter-spacing: 0.1em;
  text-align: center;
}

.access-status.granted {
  color: #00D4FF;
  text-shadow: 0 0 20px #00D4FF;
}

.access-status.denied {
  color: #FF0040;
  text-shadow: 0 0 20px #FF0040;
}
```

### 2. Member ID Display
```css
.member-id-badge {
  display: inline-block;
  background: linear-gradient(135deg, #6B46FF, #FF1B6B);
  padding: 0.5rem 1rem;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: bold;
  letter-spacing: 0.05em;
  position: relative;
  overflow: hidden;
}

.member-id-badge::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.1);
  transform: translateX(-100%);
  animation: shimmer 3s infinite;
}

@keyframes shimmer {
  to { transform: translateX(100%); }
}
```

### 3. Countdown Timer
```javascript
const CountdownTimer = ({ targetDate }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const target = new Date(targetDate).getTime();
      const difference = target - now;

      if (difference > 0) {
        const hours = Math.floor(difference / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);
        
        setTimeLeft(`${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      } else {
        setTimeLeft('EXPIRED');
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  return <span className="countdown">{timeLeft}</span>;
};
```

## Best Practices

1. **Error Handling**: Always show user-friendly messages for invitation errors
2. **Loading States**: Use dramatic, themed loading animations
3. **Social Proof**: Display "Invited by MEMBER-XXXX" prominently
4. **Urgency**: Show countdown timers and limited slots
5. **Exclusivity**: Use language like "CLASSIFIED", "CLEARANCE", "ACCESS GRANTED"
6. **Feedback**: Provide immediate visual/audio feedback for all actions
7. **Mobile**: Ensure all invitation features work seamlessly on mobile

## Security Considerations

1. Always validate invitation codes server-side
2. Store authentication tokens securely
3. Implement rate limiting on frontend
4. Don't expose sensitive invitation data in URLs
5. Use HTTPS for all API calls 