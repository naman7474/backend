const supabase = require('../config/supabase');

// Get all recommendations
const getRecommendations = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's latest analysis
    const { data: latestAnalysis, error: analysisError } = await supabase
      .from('photo_analyses')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (analysisError && analysisError.code !== 'PGRST116') {
      throw analysisError;
    }

    // Get active recommendations
    const { data: recommendations, error: recError } = await supabase
      .from('product_recommendations')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('routine_time', { ascending: true })
      .order('routine_step', { ascending: true });

    if (recError) {
      throw recError;
    }

    if (!recommendations || recommendations.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'No recommendations found. Please complete analysis first.',
          details: {
            message: 'Try triggering a new analysis to generate recommendations with valid products.'
          }
        }
      });
    }

    // Get product details for recommendations
    const productIds = recommendations.map(r => r.product_id).filter(Boolean);
    const { data: products, error: productError } = await supabase
      .from('products')
      .select('*')
      .in('product_id', productIds);

    if (productError) {
      throw productError;
    }

    // Create product map
    const productMap = {};
    products.forEach(product => {
      productMap[product.product_id] = product;
    });

    // Enhance recommendations with full product data
    const enhancedRecommendations = recommendations.map(rec => {
      const product = productMap[rec.product_id] || {};
      return {
        ...rec,
        product_data: {
          product_id: rec.product_id || product.product_id, // Ensure product_id is always included
          product_name: rec.product_name || product.product_name,
          brand: rec.brand_name || product.brand_name,
          product_type: rec.category,
          price: rec.price_mrp || product.price_mrp,
          size: product.size_qty,
          image_url: product.images ? (Array.isArray(product.images) ? product.images[0] : product.images) : null,
          key_ingredients: rec.key_ingredients || product.ingredients_extracted,
          recommendation_reason: rec.recommendation_reason,
          usage_instructions: rec.usage_instructions || product.usage_instructions,
          application_order: rec.routine_step,
          match_score: rec.match_score
        }
      };
    });

    // Group by routine time
    const morningRoutine = enhancedRecommendations
      .filter(r => r.routine_time === 'morning')
      .map(r => r.product_data);

    const eveningRoutine = enhancedRecommendations
      .filter(r => r.routine_time === 'evening')
      .map(r => r.product_data);

    const weeklyRoutine = enhancedRecommendations
      .filter(r => r.routine_time === 'weekly')
      .map(r => r.product_data);

    // Get AI insights from latest analysis
    let aiInsights = {
      primary_focus: 'Personalized skincare routine',
      routine_philosophy: 'A balanced approach to address your specific skin concerns',
      expected_timeline: '4-6 weeks for visible improvements',
      lifestyle_tips: []
    };

    if (latestAnalysis && latestAnalysis.analysis_data) {
      const analysisData = latestAnalysis.analysis_data;
      aiInsights = {
        primary_focus: analysisData.overallAssessment?.primaryDiagnosis || aiInsights.primary_focus,
        routine_philosophy: analysisData.routinePhilosophy || aiInsights.routine_philosophy,
        expected_timeline: analysisData.expectedTimeline || aiInsights.expected_timeline,
        lifestyle_tips: analysisData.personalizedInsights?.lifestyleImpact || []
      };
    }

    // Calculate skin analysis summary
    const skinAnalysisSummary = {
      skin_type: latestAnalysis?.skin_attributes?.skinType || 'combination',
      main_concerns: latestAnalysis?.skin_concerns?.map(c => c.type) || [],
      skin_score: latestAnalysis?.overall_skin_score || 75,
      improvement_potential: '+20%'
    };

    const response = {
      success: true,
      data: {
        analysis_id: latestAnalysis?.id || null,
        generated_at: recommendations[0]?.created_at || new Date().toISOString(),
        expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
        skin_analysis_summary: skinAnalysisSummary,
        routine: {
          morning: morningRoutine,
          evening: eveningRoutine,
          weekly: weeklyRoutine
        },
        targeted_treatments: enhancedRecommendations
          .filter(r => r.personalization_factors?.targetsConcerns)
          .map(r => ({
            concern: r.personalization_factors.targetsConcerns[0],
            product_type: r.category,
            key_ingredients: r.key_ingredients,
            application_zones: r.application_areas || {},
            frequency: r.application_frequency || 'daily'
          })),
        ai_insights: aiInsights,
        alternative_products: {
          budget_friendly: [],
          premium: []
        }
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to get recommendations'
      }
    });
  }
};

// Get recommendation detail
const getRecommendationDetail = async (req, res) => {
  try {
    const recommendationId = req.params.recommendationId;
    const userId = req.user.id;

    const { data: recommendation, error } = await supabase
      .from('product_recommendations')
      .select('*')
      .eq('id', recommendationId)
      .eq('user_id', userId)
      .single();

    if (error || !recommendation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Recommendation not found'
        }
      });
    }

    // Get full product details
    if (recommendation.product_id) {
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('product_id', recommendation.product_id)
        .single();

      if (!productError && product) {
        recommendation.full_product_details = product;
      }
    }

    res.status(200).json({
      success: true,
      data: recommendation
    });
  } catch (error) {
    console.error('Get recommendation detail error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to get recommendation detail'
      }
    });
  }
};

// Submit feedback
const submitFeedback = async (req, res) => {
  try {
    const recommendationId = req.params.recommendationId;
    const userId = req.user.id;
    const { feedback, effective } = req.body;

    const { data, error } = await supabase
      .from('product_recommendations')
      .update({
        user_feedback: feedback,
        marked_effective: effective,
        updated_at: new Date().toISOString()
      })
      .eq('id', recommendationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      data: {
        message: 'Feedback submitted successfully',
        recommendation: data
      }
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to submit feedback'
      }
    });
  }
};

// Update rating
const updateRating = async (req, res) => {
  try {
    const recommendationId = req.params.recommendationId;
    const userId = req.user.id;
    const { rating } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Rating must be between 1 and 5'
        }
      });
    }

    const { data, error } = await supabase
      .from('product_recommendations')
      .update({
        user_rating: rating,
        updated_at: new Date().toISOString()
      })
      .eq('id', recommendationId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(200).json({
      success: true,
      data: {
        message: 'Rating updated successfully',
        recommendation: data
      }
    });
  } catch (error) {
    console.error('Update rating error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update rating'
      }
    });
  }
};

module.exports = {
  getRecommendations,
  getRecommendationDetail,
  submitFeedback,
  updateRating
}; 