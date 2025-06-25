const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const {
  performComprehensiveAnalysis,
  matchProductsWithAI,
  selectFinalProductsWithAI,
  saveAIAnalysisResults
} = require('../services/ai-analysis.service');

// In-memory storage for analysis status (in production, use Redis)
const analysisStatus = {};

// Trigger comprehensive AI analysis
const triggerAnalysis = async (req, res) => {
  try {
    const userId = req.user.id;
    const { session_id, include_photo_analysis = true, analysis_depth = 'comprehensive' } = req.body;

    // Check if user has completed profile
    const { data: profile, error: profileError } = await supabase
      .from('beauty_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please complete your beauty profile first'
        }
      });
    }

    // Check if user has photo analysis
    let photoAnalysis = null;
    if (include_photo_analysis) {
      const { data: latestAnalysis, error: analysisError } = await supabase
        .from('photo_analyses')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!analysisError && latestAnalysis) {
        photoAnalysis = latestAnalysis;
      }
    }

    if (include_photo_analysis && !photoAnalysis) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please upload and process a photo first'
        }
      });
    }

    // Generate analysis ID
    const analysisId = uuidv4();

    // Initialize analysis status
    analysisStatus[analysisId] = {
      status: 'processing',
      progress: 0,
      current_step: 'Initializing analysis',
      steps_completed: [],
      steps_pending: [
        'photo_analysis',
        'profile_analysis',
        'saving_analysis',
        'rule_based_filtering',
        'ai_product_selection',
        'routine_optimization'
      ],
      started_at: new Date().toISOString()
    };

    // Start async analysis
    performFullAnalysisAsync(analysisId, userId, profile, photoAnalysis);

    res.status(202).json({
      success: true,
      data: {
        analysis_id: analysisId,
        status: 'processing',
        estimated_time: 45,
        queue_position: 1
      }
    });
  } catch (error) {
    console.error('Trigger analysis error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to trigger analysis'
      }
    });
  }
};

// Perform full analysis asynchronously
const performFullAnalysisAsync = async (analysisId, userId, profile, photoAnalysisData) => {
  try {
    // Step 1: Comprehensive AI Analysis
    updateAnalysisStatus(analysisId, 'profile_analysis', 15);
    
    const comprehensiveAnalysis = await performComprehensiveAnalysis(
      userId,
      photoAnalysisData ? photoAnalysisData.analysis_data : null,
      profile
    );

    // Step 1.5: Save AI Analysis Results
    updateAnalysisStatus(analysisId, 'saving_analysis', 25);
    try {
      await saveAIAnalysisResults(
        userId,
        photoAnalysisData ? photoAnalysisData.id : null,
        photoAnalysisData ? photoAnalysisData.analysis_data : null,
        comprehensiveAnalysis
      );
      console.log('✅ AI analysis results saved successfully');
    } catch (saveError) {
      console.error('❌ Failed to save AI analysis results, but continuing with process:', saveError);
      // Don't throw error - continue with the analysis process
    }

    // Step 2: Rule-based Product Filtering + AI Matching
    updateAnalysisStatus(analysisId, 'rule_based_filtering', 45);
    
    const matchedProducts = await matchProductsWithAI(
      comprehensiveAnalysis,
      profile
    );

    // Step 3: AI Product Selection
    updateAnalysisStatus(analysisId, 'ai_product_selection', 65);
    
    const finalRecommendations = await selectFinalProductsWithAI(
      matchedProducts,
      comprehensiveAnalysis,
      profile
    );

    // Step 4: Routine Optimization & Save Recommendations
    updateAnalysisStatus(analysisId, 'routine_optimization', 85);
    
    await saveRecommendations(userId, analysisId, finalRecommendations, comprehensiveAnalysis, photoAnalysisData);

    // Complete
    analysisStatus[analysisId] = {
      ...analysisStatus[analysisId],
      status: 'completed',
      progress: 100,
      current_step: 'Analysis complete',
      completed_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('Analysis error:', error);
    analysisStatus[analysisId] = {
      ...analysisStatus[analysisId],
      status: 'failed',
      error: error.message,
      completed_at: new Date().toISOString()
    };
  }
};

// Update analysis status
const updateAnalysisStatus = (analysisId, step, progress) => {
  if (!analysisStatus[analysisId]) return;

  const currentSteps = analysisStatus[analysisId].steps_completed;
  if (!currentSteps.includes(step)) {
    currentSteps.push(step);
  }

  analysisStatus[analysisId] = {
    ...analysisStatus[analysisId],
    progress,
    current_step: `Processing ${step.replace(/_/g, ' ')}`,
    steps_completed: currentSteps,
    steps_pending: analysisStatus[analysisId].steps_pending.filter(s => s !== step)
  };
};

// Save recommendations to database
const saveRecommendations = async (userId, analysisId, recommendations, aiAnalysis, photoAnalysis) => {
  try {
    // Deactivate old recommendations
    await supabase
      .from('product_recommendations')
      .update({ is_active: false })
      .eq('user_id', userId);

    // Prepare recommendation records
    const recommendationRecords = [];

    // Verify all product IDs exist in database
    const allProductIds = [
      ...recommendations.morningRoutine.map(p => p.productId),
      ...recommendations.eveningRoutine.map(p => p.productId)
    ];
    
    const { data: existingProducts, error: productCheckError } = await supabase
      .from('products')
      .select('product_id')
      .in('product_id', allProductIds);
    
    if (productCheckError) {
      console.error('Product verification error:', productCheckError);
    }
    
    const validProductIds = new Set(existingProducts?.map(p => p.product_id) || []);
    console.log('Valid product IDs found:', validProductIds);
    console.log('Requested product IDs:', allProductIds);

    // Morning routine
    recommendations.morningRoutine.forEach((product, index) => {
      // Skip products with invalid IDs
      if (!validProductIds.has(product.productId)) {
        console.warn(`Skipping invalid product ID: ${product.productId}`);
        return;
      }
      
      recommendationRecords.push({
        user_id: userId,
        analysis_id: photoAnalysis?.id || null,
        product_id: product.productId,
        product_name: product.productName,
        brand_name: product.brandName,
        price_mrp: product.price,
        category: product.productType,
        routine_time: 'morning',
        routine_step: product.applicationOrder,
        usage_instructions: product.howToUse,
        recommendation_reason: product.whyRecommended,
        key_ingredients: product.keyIngredients,
        expected_results: {
          description: product.expectedResults,
          timeline: product.timeToSeeResults
        },
        product_data: {
          id: product.productId,
          name: product.productName,
          brand: product.brandName,
          price: product.price,
          type: product.productType,
          ingredients: product.keyIngredients,
          description: product.whyRecommended,
          usage: product.howToUse,
          results: product.expectedResults,
          timeline: product.timeToSeeResults
        },
        match_score: 95 - (index * 2), // Score based on order
        ai_match_score: 0.9 - (index * 0.02),
        personalization_factors: {
          targetsConcerns: aiAnalysis.treatmentPlan.priorities.map(p => p.concern),
          matchesProfile: true
        },
        is_active: true
      });
    });

    // Evening routine
    recommendations.eveningRoutine.forEach((product, index) => {
      // Skip products with invalid IDs
      if (!validProductIds.has(product.productId)) {
        console.warn(`Skipping invalid product ID: ${product.productId}`);
        return;
      }
      
      recommendationRecords.push({
        user_id: userId,
        analysis_id: photoAnalysis?.id || null,
        product_id: product.productId,
        product_name: product.productName,
        brand_name: product.brandName,
        price_mrp: product.price,
        category: product.productType,
        routine_time: 'evening',
        routine_step: product.applicationOrder,
        usage_instructions: product.howToUse,
        recommendation_reason: product.whyRecommended,
        key_ingredients: product.keyIngredients,
        expected_results: {
          description: product.expectedResults,
          timeline: product.timeToSeeResults
        },
        product_data: {
          id: product.productId,
          name: product.productName,
          brand: product.brandName,
          price: product.price,
          type: product.productType,
          ingredients: product.keyIngredients,
          description: product.whyRecommended,
          usage: product.howToUse,
          results: product.expectedResults,
          timeline: product.timeToSeeResults
        },
        match_score: 93 - (index * 2),
        ai_match_score: 0.88 - (index * 0.02),
        personalization_factors: {
          targetsConcerns: aiAnalysis.treatmentPlan.priorities.map(p => p.concern),
          matchesProfile: true
        },
        is_active: true
      });
    });

    // Save all recommendations
    console.log('💾 Saving recommendations for userId:', userId);
    
    const { error } = await supabase
      .from('product_recommendations')
      .insert(recommendationRecords);

    if (error) throw error;

    // Update beauty profile to mark recommendations generated
    await supabase
      .from('beauty_profiles')
      .update({ 
        recommendations_generated: true,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

  } catch (error) {
    console.error('Save recommendations error:', error);
    throw error;
  }
};

// Get analysis status
const getAnalysisStatus = async (req, res) => {
  try {
    const analysisId = req.params.analysisId;

    const status = analysisStatus[analysisId];
    if (!status) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Analysis not found'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Get analysis status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to get analysis status'
      }
    });
  }
};

// Get analysis details
const getAnalysis = async (req, res) => {
  try {
    const analysisId = req.params.analysisId;
    const userId = req.user.id;

    // Check if analysis exists and is complete
    const status = analysisStatus[analysisId];
    if (!status || status.status !== 'completed') {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Analysis not found or not complete'
        }
      });
    }

    // Get recommendations
    const { data: recommendations, error } = await supabase
      .from('product_recommendations')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('routine_time', { ascending: true })
      .order('routine_step', { ascending: true });

    if (error) throw error;

    res.status(200).json({
      success: true,
      data: {
        analysis_id: analysisId,
        completed_at: status.completed_at,
        recommendations
      }
    });
  } catch (error) {
    console.error('Get analysis error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to get analysis'
      }
    });
  }
};

module.exports = {
  triggerAnalysis,
  getAnalysisStatus,
  getAnalysis
}; 