# Invitation System API Documentation

## Overview

The invitation system implements an exclusive access mechanism with the following features:
- Unique invitation codes (format: XXXX-YYYY)
- 48-hour expiration for codes
- Daily limit of 3 invitations per user
- Member IDs (format: SUBJECT-XXXX)
- Viral tracking and analytics
- Social proof tracking ("Invited by MEMBER-4521")

## Endpoints

### 1. Create Invitation
**POST** `/api/invitations/create`

Creates a new invitation code for the authenticated user.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "invitee_email": "friend@example.com" // Optional
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "invitation": {
      "id": "uuid",
      "code": "ABCD-1234",
      "expires_at": "2024-01-15T10:30:00Z",
      "invitee_email": "friend@example.com",
      "share_url": "https://app.example.com/invite/ABCD-1234",
      "inviter": {
        "member_id": "SUBJECT-A1B2",
        "email": "user@example.com"
      }
    }
  }
}
```

**Error Responses:**
- `400 Bad Request` - Daily or lifetime limit reached
- `401 Unauthorized` - Invalid or missing token
- `500 Internal Server Error` - Server error

### 2. Validate Invitation Code
**GET** `/api/invitations/validate/:code`

Validates an invitation code without using it (public endpoint).

**Parameters:**
- `code` - The invitation code to validate

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "code": "ABCD-1234",
    "inviter": {
      "member_id": "SUBJECT-A1B2",
      "name": "John Doe",
      "initial": "J"
    },
    "expires_at": "2024-01-15T10:30:00Z",
    "time_remaining": {
      "hours": 23,
      "minutes": 45,
      "display": "23h 45m"
    }
  }
}
```

**Error Responses:**
- `404 Not Found` - Invalid code
- `400 Bad Request` - Code already used or expired

### 3. Get My Invitations
**GET** `/api/invitations/my-invitations`

Gets the authenticated user's invitation history and stats.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "invitations": [
      {
        "id": "uuid",
        "code": "ABCD-1234",
        "status": "used",
        "created_at": "2024-01-13T10:00:00Z",
        "expires_at": "2024-01-15T10:00:00Z",
        "used_at": "2024-01-14T15:30:00Z",
        "share_url": "https://app.example.com/invite/ABCD-1234",
        "invitee": {
          "member_id": "SUBJECT-X9Y8",
          "name": "Jane Smith",
          "joined_at": "2024-01-14T15:30:00Z"
        }
      }
    ],
    "stats": {
      "total_invites_sent": 10,
      "total_invites_used": 7,
      "daily_invite_limit": 3,
      "lifetime_invite_limit": 50
    },
    "metrics": {
      "total_sent": 10,
      "total_accepted": 7,
      "total_pending": 2,
      "total_expired": 1,
      "viral_coefficient": 0.7,
      "success_rate": 70
    },
    "remaining_today": 2
  }
}
```

### 4. Get Invitation Network
**GET** `/api/invitations/network`

Gets the user's invitation network (who they invited and sub-invites).

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `depth` - Network depth to retrieve (default: 2, max: 5)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "network": {
      "user": {
        "id": "uuid",
        "email": "user@example.com",
        "member_id": "SUBJECT-A1B2"
      },
      "invitees": [
        {
          "id": "uuid",
          "email": "invitee1@example.com",
          "member_id": "SUBJECT-X9Y8",
          "invitees": [
            {
              "id": "uuid",
              "email": "invitee2@example.com",
              "member_id": "SUBJECT-Z7W6",
              "invitees": []
            }
          ]
        }
      ]
    }
  }
}
```

### 5. Get Viral Metrics (Admin)
**GET** `/api/invitations/metrics`

Gets viral metrics for analytics.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `timeframe` - One of: '24h', '7d', '30d', 'all' (default: '7d')

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "timeframe": "7d",
    "metrics": {
      "total_actions": 150,
      "invites_sent": 50,
      "invites_accepted": 35,
      "shares_clicked": 65,
      "conversion_rate": 70,
      "viral_coefficient": 0.7
    },
    "daily_breakdown": [
      {
        "date": "2024-01-13",
        "invites_sent": 10,
        "invites_accepted": 7,
        "shares_clicked": 15
      }
    ]
  }
}
```

### 6. Track Share Click
**POST** `/api/invitations/track-share`

Tracks when a user clicks share on an invitation.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "platform": "twitter",
  "invitation_code": "ABCD-1234" // Optional
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "tracked": true
  }
}
```

## Registration with Invitation Code

When registering with an invitation code, include it in the registration request:

**POST** `/api/auth/register`

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "securepassword",
  "first_name": "New",
  "last_name": "User",
  "invitation_code": "ABCD-1234" // Optional
}
```

**Response includes invitation details:**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token",
    "user": {
      "id": "uuid",
      "email": "newuser@example.com",
      "member_id": "SUBJECT-N3W1",
      "was_invited": true,
      "inviter": {
        "member_id": "SUBJECT-A1B2",
        "name": "John Doe"
      }
    }
  }
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `LIFETIME_LIMIT_REACHED` | User has reached lifetime invitation limit |
| `DAILY_LIMIT_REACHED` | User has reached daily invitation limit |
| `INVALID_CODE` | Invitation code is invalid |
| `CODE_ALREADY_USED` | Invitation code has already been used |
| `CODE_EXPIRED` | Invitation code has expired |

## Rate Limits

- Create invitation: 10 requests per hour per user
- Validate invitation: 60 requests per minute per IP
- Other endpoints: Standard API rate limits apply 