// Validation middleware for various endpoints

const validateRegistration = (req, res, next) => {
  const { email, password, first_name, last_name } = req.body;
  const errors = {};

  // Email validation
  if (!email || !email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Invalid email format';
  }

  // Password validation
  if (!password) {
    errors.password = 'Password is required';
  } else {
    if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (!/(?=.*[a-z])/.test(password)) {
      errors.password = 'Password must contain at least one lowercase letter';
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      errors.password = 'Password must contain at least one uppercase letter';
    }
    if (!/(?=.*\d)/.test(password)) {
      errors.password = 'Password must contain at least one number';
    }
    if (!/(?=.*[@$!%*?&])/.test(password)) {
      errors.password = 'Password must contain at least one special character';
    }
  }

  // Name validation
  if (!first_name || first_name.trim().length < 2) {
    errors.first_name = 'First name must be at least 2 characters';
  }
  if (!last_name || last_name.trim().length < 2) {
    errors.last_name = 'Last name must be at least 2 characters';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors
      }
    });
  }

  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = {};

  if (!email || !email.trim()) {
    errors.email = 'Email is required';
  }
  if (!password) {
    errors.password = 'Password is required';
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: errors
      }
    });
  }

  next();
};

const validateProfileUpdate = (req, res, next) => {
  const allowedFields = {
    skin: [
      'skin_type', 'skin_tone', 'undertone', 'primary_skin_concerns',
      'secondary_skin_concerns', 'skin_sensitivity_level', 'known_allergies'
    ],
    lifestyle: [
      'location_city', 'location_country', 'climate_type', 'pollution_level',
      'sun_exposure_daily', 'sleep_hours', 'stress_level', 'exercise_frequency',
      'water_intake'
    ],
    hair: [
      'hair_type', 'hair_texture', 'hair_porosity', 'scalp_condition',
      'hair_concerns', 'chemical_treatments'
    ],
    health: [
      'age', 'hormonal_status', 'skin_medical_conditions', 'medications',
      'dietary_type', 'supplements'
    ],
    makeup: [
      'makeup_frequency', 'makeup_style', 'preferred_look', 'coverage_preference'
    ],
    preferences: [
      'budget_range', 'favorite_brands', 'ingredient_preferences'
    ]
  };

  const profileType = req.params.profileType;
  
  if (!allowedFields[profileType]) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid profile type'
      }
    });
  }

  next();
};

const validatePhotoUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'No photo provided'
      }
    });
  }

  const allowedTypes = (process.env.ALLOWED_PHOTO_TYPES || 'image/jpeg,image/jpg,image/png,image/webp').split(',');
  
  if (!allowedTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid file type. Allowed types: ' + allowedTypes.join(', ')
      }
    });
  }

  const maxSize = (parseInt(process.env.MAX_PHOTO_SIZE_MB) || 10) * 1024 * 1024;
  
  if (req.file.size > maxSize) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: `File too large. Maximum size: ${maxSize / 1024 / 1024}MB`
      }
    });
  }

  next();
};

module.exports = {
  validateRegistration,
  validateLogin,
  validateProfileUpdate,
  validatePhotoUpload
}; 