const supabase = require('../config/supabase');

// Calculate profile completion
const calculateProfileCompletion = (profile) => {
  const sections = {
    skin: {
      required: ['skin_type', 'skin_tone', 'skin_sensitivity', 'primary_skin_concerns'],
      optional: ['undertone', 'secondary_skin_concerns', 'known_allergies']
    },
    lifestyle: {
      required: ['location_city', 'sleep_hours', 'water_intake', 'stress_level'],
      optional: ['location_country', 'climate_type', 'pollution_level', 'sun_exposure_daily', 'exercise_frequency']
    },
    preferences: {
      required: ['budget_range'],
      optional: ['favorite_brands']
    }
  };

  let totalRequired = 0;
  let completedRequired = 0;
  let totalOptional = 0;
  let completedOptional = 0;

  Object.keys(sections).forEach(section => {
    sections[section].required.forEach(field => {
      totalRequired++;
      if (profile[field] && profile[field] !== null) {
        completedRequired++;
      }
    });

    sections[section].optional.forEach(field => {
      totalOptional++;
      if (profile[field] && profile[field] !== null) {
        completedOptional++;
      }
    });
  });

  const requiredPercentage = totalRequired > 0 ? (completedRequired / totalRequired) * 100 : 0;
  const optionalPercentage = totalOptional > 0 ? (completedOptional / totalOptional) * 100 : 0;
  
  // Weight: 80% for required fields, 20% for optional
  const overallPercentage = (requiredPercentage * 0.8) + (optionalPercentage * 0.2);

  return {
    overallPercentage: Math.round(overallPercentage),
    sections: {
      skin: {
        total: sections.skin.required.length + sections.skin.optional.length,
        completed: sections.skin.required.filter(f => profile[f]).length + 
                  sections.skin.optional.filter(f => profile[f]).length,
        percentage: Math.round(
          ((sections.skin.required.filter(f => profile[f]).length / sections.skin.required.length) * 0.8 +
           (sections.skin.optional.filter(f => profile[f]).length / sections.skin.optional.length) * 0.2) * 100
        )
      },
      lifestyle: {
        total: sections.lifestyle.required.length + sections.lifestyle.optional.length,
        completed: sections.lifestyle.required.filter(f => profile[f]).length + 
                  sections.lifestyle.optional.filter(f => profile[f]).length,
        percentage: Math.round(
          ((sections.lifestyle.required.filter(f => profile[f]).length / sections.lifestyle.required.length) * 0.8 +
           (sections.lifestyle.optional.filter(f => profile[f]).length / sections.lifestyle.optional.length) * 0.2) * 100
        )
      },
      preferences: {
        total: sections.preferences.required.length + sections.preferences.optional.length,
        completed: sections.preferences.required.filter(f => profile[f]).length + 
                  sections.preferences.optional.filter(f => profile[f]).length,
        percentage: Math.round(
          ((sections.preferences.required.filter(f => profile[f]).length / sections.preferences.required.length) * 0.8 +
           (sections.preferences.optional.filter(f => profile[f]).length / sections.preferences.optional.length) * 0.2) * 100
        )
      }
    }
  };
};

// Get onboarding progress
const getOnboardingProgress = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get beauty profile
    const { data: beautyProfile, error: beautyError } = await supabase
      .from('beauty_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (beautyError && beautyError.code !== 'PGRST116') {
      throw beautyError;
    }

    // Get photo uploads
    const { data: photos, error: photoError } = await supabase
      .from('photo_uploads')
      .select('id, processing_status, created_at')
      .eq('user_id', userId)
      .eq('photo_type', 'onboarding')
      .order('created_at', { ascending: false })
      .limit(1);

    if (photoError) {
      throw photoError;
    }

    // Get photo analysis
    const { data: analysis, error: analysisError } = await supabase
      .from('photo_analyses')
      .select('id, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (analysisError) {
      throw analysisError;
    }

    // Get recommendations
    const { data: recommendations, error: recError } = await supabase
      .from('product_recommendations')
      .select('id, created_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1);

    if (recError) {
      throw recError;
    }

    // Calculate profile completion
    const profileCompletion = beautyProfile ? calculateProfileCompletion(beautyProfile) : {
      overallPercentage: 0,
      sections: {
        skin: { total: 7, completed: 0, percentage: 0 },
        lifestyle: { total: 9, completed: 0, percentage: 0 },
        preferences: { total: 3, completed: 0, percentage: 0 }
      }
    };

    // Determine next step
    let nextStep = 'profile';
    if (profileCompletion.overallPercentage >= 80) {
      if (!photos || photos.length === 0) {
        nextStep = 'photo';
      } else if (photos[0].processing_status === 'completed' && recommendations && recommendations.length > 0) {
        nextStep = 'view_results';
      } else if (photos[0].processing_status === 'processing') {
        nextStep = 'processing';
      } else {
        nextStep = 'analysis';
      }
    }

    const response = {
      success: true,
      data: {
        steps: {
          profile: {
            complete: profileCompletion.overallPercentage >= 80,
            percentage: profileCompletion.overallPercentage,
            sections: profileCompletion.sections
          },
          photo: {
            uploaded: photos && photos.length > 0,
            processed: photos && photos.length > 0 && photos[0].processing_status === 'completed',
            status: photos && photos.length > 0 ? photos[0].processing_status : 'pending'
          },
          recommendations: {
            generated: recommendations && recommendations.length > 0,
            last_updated: recommendations && recommendations.length > 0 ? recommendations[0].created_at : null
          }
        },
        overallProgress: Math.round(
          (profileCompletion.overallPercentage >= 80 ? 33 : profileCompletion.overallPercentage * 0.33) +
          (photos && photos.length > 0 ? 33 : 0) +
          (recommendations && recommendations.length > 0 ? 34 : 0)
        ),
        nextStep
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Get onboarding progress error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to get onboarding progress'
      }
    });
  }
};

// Update profile section
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const profileType = req.params.profileType;
    const updates = req.body;

    // Map profile types to update fields
    const fieldMappings = {
      skin: {
        skin_type: updates.skin_type,
        skin_tone: updates.skin_tone,
        undertone: updates.undertone,
        primary_skin_concerns: updates.primary_skin_concerns,
        secondary_skin_concerns: updates.secondary_skin_concerns,
        skin_sensitivity_level: updates.skin_sensitivity,
        known_allergies: updates.known_allergies
      },
      lifestyle: {
        location_city: updates.location_city,
        location_country: updates.location_country,
        climate_type: updates.climate_type,
        pollution_level: updates.pollution_level,
        sun_exposure_daily: updates.sun_exposure_daily,
        sleep_hours_avg: updates.sleep_hours,
        stress_level: updates.stress_level,
        exercise_frequency: updates.exercise_frequency,
        water_intake_daily: updates.water_intake
      },
      hair: {
        hair_type: updates.hair_type,
        hair_texture: updates.hair_texture,
        hair_porosity: updates.hair_porosity,
        scalp_condition: updates.scalp_condition,
        hair_concerns: updates.hair_concerns,
        chemical_treatments: updates.chemical_treatments
      },
      health: {
        age: updates.age,
        hormonal_status: updates.hormonal_status,
        skin_medical_conditions: updates.skin_medical_conditions,
        medications: updates.medications,
        dietary_type: updates.dietary_type,
        supplements: updates.supplements
      },
      makeup: {
        makeup_frequency: updates.makeup_frequency,
        makeup_style: updates.makeup_style,
        preferred_look: updates.preferred_look,
        coverage_preference: updates.coverage_preference
      },
      preferences: {
        budget_range: updates.budget_range,
        favorite_brands: updates.favorite_brands
      }
    };

    const updateData = fieldMappings[profileType];
    if (!updateData) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid profile type'
        }
      });
    }

    // Check if profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('beauty_profiles')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }

    let result;
    if (existingProfile) {
      // Update existing profile
      const { data, error } = await supabase
        .from('beauty_profiles')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new profile
      const { data, error } = await supabase
        .from('beauty_profiles')
        .insert({
          user_id: userId,
          ...updateData
        })
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    res.status(200).json({
      success: true,
      data: {
        message: 'Profile updated successfully',
        profile: result
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update profile'
      }
    });
  }
};

// Get complete profile
const getCompleteProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: profile, error } = await supabase
      .from('beauty_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    res.status(200).json({
      success: true,
      data: profile || {}
    });
  } catch (error) {
    console.error('Get complete profile error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to get profile'
      }
    });
  }
};

// Get profile section
const getProfileSection = async (req, res) => {
  try {
    const userId = req.user.id;
    const profileType = req.params.profileType;

    const sectionFields = {
      skin: [
        'skin_type', 'skin_tone', 'undertone', 'primary_skin_concerns',
        'secondary_skin_concerns', 'skin_sensitivity_level', 'known_allergies'
      ],
      lifestyle: [
        'location_city', 'location_country', 'climate_type', 'pollution_level',
        'sun_exposure_daily', 'sleep_hours_avg', 'stress_level', 'exercise_frequency',
        'water_intake_daily'
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
        'budget_range', 'favorite_brands'
      ]
    };

    const fields = sectionFields[profileType];
    if (!fields) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid profile type'
        }
      });
    }

    const { data: profile, error } = await supabase
      .from('beauty_profiles')
      .select(fields.join(','))
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    res.status(200).json({
      success: true,
      data: profile || {}
    });
  } catch (error) {
    console.error('Get profile section error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to get profile section'
      }
    });
  }
};

module.exports = {
  getOnboardingProgress,
  updateProfile,
  getCompleteProfile,
  getProfileSection
}; 