# Beauty AI Platform - API Implementation Guide

## 📋 Overview
This document provides complete API implementation details with mock data for frontend integration. All endpoints are implemented and tested.

**Base URL:** `http://localhost:3001/api` (development)  
**Authentication:** Bearer JWT Token  
**Content-Type:** `application/json`

---

## 🔐 Authentication APIs

### 1. User Registration
**POST** `/auth/register`

**Request:**
```json
{
  "email": "jane.doe@example.com",
  "password": "SecurePass123!",
  "first_name": "Jane",
  "last_name": "Doe"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "jane.doe@example.com",
      "first_name": "Jane",
      "last_name": "Doe",
      "created_at": "2024-01-15T10:00:00Z"
    }
  }
}
```

**Validation Errors (400):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": {
      "email": "Email already exists"
    }
  }
}
```

### 2. User Login
**POST** `/auth/login`

**Request:**
```json
{
  "email": "jane.doe@example.com",
  "password": "SecurePass123!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "jane.doe@example.com",
      "first_name": "Jane",
      "last_name": "Doe"
    }
  }
}
```

### 3. Refresh Token
**POST** `/auth/refresh`

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

## 👤 Profile Management APIs

### 1. Get Onboarding Progress
**GET** `/profile/beauty/onboarding`

**Headers:**
```
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "steps": {
      "profile": {
        "complete": true,
        "percentage": 85,
        "sections": {
          "skin": {
            "total": 7,
            "completed": 7,
            "percentage": 100
          },
          "lifestyle": {
            "total": 9,
            "completed": 7,
            "percentage": 78
          },
          "preferences": {
            "total": 3,
            "completed": 3,
            "percentage": 100
          }
        }
      },
      "photo": {
        "uploaded": true,
        "processed": true,
        "status": "completed"
      },
      "recommendations": {
        "generated": true,
        "last_updated": "2024-01-15T10:00:00Z"
      }
    },
    "overallProgress": 95,
    "nextStep": "view_results"
  }
}
```

### 2. Update Skin Profile
**PUT** `/profile/beauty/skin`

**Request:**
```json
{
  "skin_type": "Oily & Shiny",
  "skin_tone": "medium",
  "undertone": "warm",
  "primary_skin_concerns": ["acne", "dark_spots", "large_pores"],
  "secondary_skin_concerns": ["blackheads"],
  "skin_sensitivity": "Slightly Sensitive",
  "known_allergies": ["fragrance", "alcohol"]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Profile updated successfully",
    "profile": {
      "id": "profile_uuid",
      "skin_type": "Oily & Shiny",
      "skin_tone": "medium",
      "undertone": "warm",
      "primary_skin_concerns": ["acne", "dark_spots", "large_pores"],
      "updated_at": "2024-01-15T10:30:00Z"
    }
  }
}
```

### 3. Update Lifestyle Profile
**PUT** `/profile/beauty/lifestyle`

**Request:**
```json
{
  "location_city": "New York",
  "location_country": "USA",
  "climate_type": "temperate",
  "pollution_level": "moderate",
  "sun_exposure_daily": "moderate",
  "sleep_hours": "7-9 hours",
  "stress_level": "Moderate",
  "exercise_frequency": "active",
  "water_intake": "6-8 glasses"
}
```

### 4. Update Other Profile Sections
**PUT** `/profile/beauty/{profileType}`

Available profile types: `hair`, `health`, `makeup`, `preferences`

**Example - Hair Profile:**
```json
{
  "hair_type": "Curly",
  "hair_texture": "coarse",
  "hair_porosity": "high",
  "scalp_condition": "dry",
  "hair_concerns": ["frizz", "dryness"],
  "chemical_treatments": ["coloring", "straightening"]
}
```

---

## 📸 Photo Upload & Analysis APIs

### 1. Upload Photo
**POST** `/photo/upload`

**Headers:**
```
Authorization: Bearer {token}
Content-Type: multipart/form-data
```

**Form Data:**
```
photo: [File] (JPEG/PNG, max 10MB)
photo_type: "onboarding"
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "session_id": "session_uuid_12345",
    "photo_id": "photo_uuid_67890",
    "processing_status": "queued",
    "estimated_time": 30
  }
}
```

### 2. Get Photo Processing Status
**GET** `/photo/status/{session_id}`

**Response - Processing (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "processing",
    "progress": 65,
    "current_step": "Detecting facial landmarks",
    "face_model_url": null,
    "face_landmarks": null
  }
}
```

**Response - Completed (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "progress": 100,
    "current_step": "Analysis complete",
    "face_model_url": "/models/user_123_face.obj",
    "face_landmarks": {
      "forehead": {"x": 50, "y": 30},
      "cheeks": {"x": 45, "y": 60},
      "chin": {"x": 50, "y": 85}
    },
    "processing_time": 28.5,
    "analysis": {
      "skin_concerns": [
        {
          "type": "acne",
          "severity": "mild",
          "locations": ["forehead", "chin"],
          "confidence": 0.89
        },
        {
          "type": "dark_spots",
          "severity": "moderate", 
          "locations": ["cheeks"],
          "confidence": 0.76
        }
      ],
      "skin_attributes": {
        "tone": "medium",
        "undertone": "warm",
        "texture": "uneven",
        "age_appearance": 28
      },
      "overall_skin_score": 78,
      "ai_observations": [
        "Mild acne detected in T-zone area",
        "Some hyperpigmentation on cheeks",
        "Good skin hydration levels"
      ],
      "positive_attributes": [
        "Natural glow",
        "Even skin tone in most areas"
      ]
    }
  }
}
```

---

## 🤖 AI Analysis APIs

### 1. Trigger Complete AI Analysis
**POST** `/analysis/trigger`

**Request:**
```json
{
  "session_id": "session_uuid_12345",
  "include_photo_analysis": true,
  "analysis_depth": "comprehensive"
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "analysis_id": "analysis_uuid_98765",
    "status": "processing",
    "estimated_time": 45,
    "queue_position": 1
  }
}
```

### 2. Get AI Analysis Status
**GET** `/analysis/status/{analysis_id}`

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "status": "processing",
    "progress": 45,
    "current_step": "Generating personalized recommendations",
    "steps_completed": [
      "photo_analysis",
      "profile_analysis", 
      "skin_concern_mapping"
    ],
    "steps_pending": [
      "product_matching",
      "routine_optimization"
    ]
  }
}
```

---

## 💡 Recommendations API

### 1. Get Complete Recommendations
**GET** `/recommendations/beauty`

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "analysis_id": "analysis_uuid_98765",
    "generated_at": "2024-01-15T10:30:00Z",
    "expiry_date": "2024-04-15T10:30:00Z",
    "skin_analysis_summary": {
      "skin_type": "combination",
      "main_concerns": ["acne", "dark_spots", "large_pores"],
      "skin_score": 78,
      "improvement_potential": "+20%"
    },
    "routine": {
      "morning": [
        {
          "product_id": "prod_123",
          "product_name": "Gentle Foam Cleanser",
          "brand": "PureGlow",
          "product_type": "cleanser",
          "price": 24.99,
          "size": "150ml",
          "image_url": "https://example.com/cleanser.jpg",
          "key_ingredients": ["2% Salicylic Acid", "Green Tea Extract"],
          "recommendation_reason": "Salicylic acid helps control oil and prevent acne",
          "usage_instructions": "Massage onto wet face for 30 seconds",
          "application_order": 1,
          "match_score": 95
        },
        {
          "product_id": "prod_124",
          "product_name": "Niacinamide Serum",
          "brand": "SkinScience",
          "product_type": "serum",
          "price": 18.99,
          "size": "30ml",
          "image_url": "https://example.com/serum.jpg",
          "key_ingredients": ["10% Niacinamide", "Zinc"],
          "recommendation_reason": "Reduces pore appearance and controls oil production",
          "usage_instructions": "Apply 2-3 drops after cleansing",
          "application_order": 2,
          "match_score": 92
        }
      ],
      "evening": [
        {
          "product_id": "prod_125",
          "product_name": "Retinol Night Cream",
          "brand": "NightRepair",
          "product_type": "moisturizer",
          "price": 45.99,
          "size": "50ml",
          "image_url": "https://example.com/retinol.jpg",
          "key_ingredients": ["0.5% Retinol", "Ceramides"],
          "recommendation_reason": "Promotes cell turnover and reduces fine lines",
          "usage_instructions": "Apply thin layer before bed, use 2-3x per week initially",
          "application_order": 3,
          "match_score": 88
        }
      ],
      "weekly": [
        {
          "product_id": "prod_126",
          "product_name": "AHA Exfoliating Mask",
          "brand": "GlowLab",
          "product_type": "mask",
          "price": 32.99,
          "size": "75ml",
          "image_url": "https://example.com/mask.jpg",
          "key_ingredients": ["Glycolic Acid", "Lactic Acid"],
          "recommendation_reason": "Deep exfoliation for smoother skin texture",
          "usage_instructions": "Apply for 10 minutes once weekly",
          "application_order": 1,
          "match_score": 85
        }
      ]
    },
    "targeted_treatments": [
      {
        "concern": "acne",
        "product_type": "spot_treatment",
        "key_ingredients": ["Benzoyl Peroxide", "Tea Tree Oil"],
        "application_zones": {
          "forehead": {"x": 50, "y": 30, "radius": 15},
          "chin": {"x": 50, "y": 80, "radius": 10}
        },
        "frequency": "as_needed"
      }
    ],
    "ai_insights": {
      "primary_focus": "Oil control and acne prevention",
      "routine_philosophy": "Gentle yet effective approach focusing on salicylic acid and niacinamide",
      "expected_timeline": "Visible improvements in 4-6 weeks",
      "lifestyle_tips": [
        "Increase water intake to 8 glasses daily",
        "Change pillowcases twice weekly",
        "Avoid touching face throughout the day"
      ]
    },
    "alternative_products": {
      "budget_friendly": [
        {
          "product_id": "prod_127",
          "product_name": "Budget Cleanser",
          "brand": "ValueSkin",
          "price": 12.99
        }
      ],
      "premium": [
        {
          "product_id": "prod_128", 
          "product_name": "Luxury Serum",
          "brand": "PremiumCare",
          "price": 89.99
        }
      ]
    }
  }
}
```

### 2. Submit Recommendation Feedback
**POST** `/recommendations/feedback/{recommendation_id}`

**Request:**
```json
{
  "feedback": "This product worked great for my acne!",
  "effective": true
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Feedback submitted successfully",
    "recommendation": {
      "id": "rec_123",
      "user_feedback": "This product worked great for my acne!",
      "marked_effective": true,
      "updated_at": "2024-01-15T10:45:00Z"
    }
  }
}
```

### 3. Update Recommendation Rating
**PUT** `/recommendations/rating/{recommendation_id}`

**Request:**
```json
{
  "rating": 5
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Rating updated successfully",
    "recommendation": {
      "id": "rec_123",
      "user_rating": 5,
      "updated_at": "2024-01-15T10:45:00Z"
    }
  }
}
```

---

## 📊 Progress Tracking APIs

### 1. Save Routine Completion
**POST** `/progress/routine`

**Request:**
```json
{
  "date": "2024-01-15",
  "routine_type": "morning",
  "completed": true,
  "products_used": ["prod_123", "prod_124"],
  "notes": "Skin feeling less oily today"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Routine completion saved successfully"
  }
}
```

### 2. Get Progress Timeline
**GET** `/progress/timeline?start_date=2024-01-01&end_date=2024-01-31`

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "completion_stats": {
      "overall_percentage": 85,
      "current_streak": 7,
      "longest_streak": 14,
      "total_days": 30
    },
    "daily_records": [
      {
        "date": "2024-01-15",
        "morning": true,
        "evening": false,
        "notes": "Skin feeling less oily"
      },
      {
        "date": "2024-01-14",
        "morning": true,
        "evening": true,
        "notes": null
      }
    ],
    "improvements": {
      "acne": {
        "initial_severity": "moderate",
        "current_severity": "mild",
        "improvement_percentage": 35
      }
    }
  }
}
```

### 3. Submit Progress Feedback
**POST** `/progress/feedback`

**Request:**
```json
{
  "days_used": 14,
  "overall_satisfaction": "Much Better",
  "skin_improvements": ["less_oily", "fewer_breakouts"],
  "routine_adjustments_needed": false,
  "comments": "Loving the results so far!"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Feedback submitted successfully"
  }
}
```

---

## 🛍️ Product Search API

### 1. Search Products
**POST** `/products/search`

**Request:**
```json
{
  "query": "vitamin c serum",
  "filters": {
    "price_range": [20, 100],
    "concerns": ["dark_spots"],
    "ingredients_include": ["vitamin c"],
    "ingredients_exclude": ["alcohol"]
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "1",
        "product_id": "prod_200",
        "product_name": "Vitamin C Brightening Serum",
        "brand_name": "GlowLab",
        "category_path": "skincare/serums",
        "price_mrp": 45.99,
        "price_sale": 39.99,
        "size_qty": "30ml",
        "images": "https://example.com/vitamin-c-serum.jpg",
        "rating_avg": 4.5,
        "rating_count": 1250,
        "ingredients_extracted": [
          {"name": "Vitamin C", "percentage": "15%"},
          {"name": "Hyaluronic Acid", "percentage": "2%"}
        ],
        "benefits_extracted": [
          "Brightening",
          "Anti-aging", 
          "Dark spot reduction"
        ]
      }
    ],
    "total_count": 1,
    "filters_applied": {
      "query": "vitamin c serum",
      "price_range": [20, 100],
      "concerns": ["dark_spots"],
      "ingredients_include": ["vitamin c"],
      "ingredients_exclude": ["alcohol"]
    }
  }
}
```

### 2. Get Product Details
**GET** `/products/{id}`

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "product": {
      "id": "1",
      "product_id": "prod_200",
      "product_name": "Vitamin C Brightening Serum",
      "brand_name": "GlowLab",
      "category_path": "skincare/serums",
      "price_mrp": 45.99,
      "price_sale": 39.99,
      "currency": "USD",
      "size_qty": "30ml",
      "images": "https://example.com/vitamin-c-serum.jpg",
      "description_html": "<p>Advanced vitamin C serum...</p>",
      "ingredients_raw": "Ascorbic Acid, Hyaluronic Acid...",
      "usage_instructions": "Apply 2-3 drops to clean skin",
      "average_rating": 4.5,
      "review_count": 1250
    }
  }
}
```

---

## 👥 Influencer APIs

### 1. Get Recommended Influencers
**GET** `/influencers/recommended`

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "influencers": [
      {
        "id": "inf_123",
        "name": "Sarah Beauty",
        "handle": "@sarahbeauty",
        "profile_image": "https://example.com/sarah.jpg",
        "followers_count": "125K",
        "skin_type": "oily",
        "skin_concerns": ["acne", "large_pores"],
        "bio": "Skincare enthusiast sharing honest reviews",
        "recent_recommendations": [
          {
            "product_id": "prod_123",
            "product_name": "Gentle Cleanser",
            "recommendation_reason": "Perfect for sensitive oily skin"
          }
        ]
      }
    ],
    "total_count": 1
  }
}
```

### 2. Get Influencer Details
**GET** `/influencers/{id}`

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "influencer": {
      "id": "inf_123",
      "name": "Sarah Beauty",
      "handle": "@sarahbeauty",
      "profile_image": "https://example.com/sarah.jpg",
      "bio": "Skincare enthusiast with 5+ years of experience...",
      "followers_count": "125K",
      "skin_type": "oily",
      "skin_concerns": ["acne", "large_pores"],
      "product_recommendations": [
        {
          "product_id": "prod_123",
          "product_name": "Gentle Cleanser",
          "recommendation_reason": "Perfect for my oily skin type",
          "rating": 5,
          "review_text": "This cleanser changed my skincare game...",
          "created_at": "2024-01-10T10:00:00Z"
        }
      ]
    }
  }
}
```

---

## ❌ Error Handling

### Standard Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {} // Optional additional details
  }
}
```

### Common Error Codes
- `AUTHENTICATION_ERROR` (401) - Invalid or missing token
- `VALIDATION_ERROR` (400) - Invalid request data
- `NOT_FOUND` (404) - Resource not found
- `RATE_LIMIT_EXCEEDED` (429) - Too many requests
- `SERVER_ERROR` (500) - Internal server error

---

## 🔧 Frontend Integration Notes

### 1. Authentication Flow
```javascript
// Store token in localStorage/sessionStorage
const token = response.data.token;
localStorage.setItem('authToken', token);

// Include in all API requests
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
```

### 2. Photo Upload
```javascript
const formData = new FormData();
formData.append('photo', file);
formData.append('photo_type', 'onboarding');

const response = await fetch('/api/photo/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});
```

### 3. Polling for Status
```javascript
const pollStatus = async (sessionId) => {
  const response = await fetch(`/api/photo/status/${sessionId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();
  
  if (data.data.status === 'processing') {
    setTimeout(() => pollStatus(sessionId), 2000);
  }
  return data;
};
```

### 4. Rate Limiting
- Photo uploads: 10 per day per user
- AI analysis: 5 per day per user  
- API calls: 1000 per hour per user

### 5. File Upload Constraints
- Max file size: 10MB
- Supported formats: JPEG, PNG
- HEIF/HEIC formats will return specific error

---

## 🚀 Ready for Integration

All endpoints are implemented and tested. The backend handles:
- ✅ Comprehensive error handling
- ✅ Input validation
- ✅ Rate limiting
- ✅ Authentication & authorization
- ✅ File processing & storage
- ✅ AI-powered analysis
- ✅ Real-time status updates

The API is production-ready for frontend integration! 