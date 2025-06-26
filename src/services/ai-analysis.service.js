const { models } = require('../config/gemini');
const supabase = require('../config/supabase');
const { filterProductsForUser } = require('./product-filter.service');

// Analyze photo using Gemini Vision
const analyzePhotoWithAI = async (photoBase64) => {
  try {
    const prompt = `You are an expert dermatologist analyzing a facial photograph for skincare assessment.

    Analyze this face photo and provide a detailed professional assessment including:

    1. SKIN ANALYSIS:
    - Skin type (dry, oily, combination, normal)
    - Skin tone (fair, medium, dusky, deep)
    - Undertone (warm, cool, neutral)
    - Overall skin texture quality
    - Estimated age appearance

    2. SKIN CONCERNS (identify and rate severity 1-10):
    - Acne/breakouts
    - Dark spots/hyperpigmentation
    - Fine lines/wrinkles
    - Large pores
    - Blackheads/whiteheads
    - Dark circles
    - Uneven skin tone
    - Redness/irritation
    - Dullness
    - Dehydration signs

    3. POSITIVE ATTRIBUTES:
    - Natural glow areas
    - Even skin tone areas
    - Good features to maintain

    4. SPECIFIC PROBLEM AREAS:
    - Map concerns to facial zones (forehead, cheeks, nose, chin, under-eye)

    5. PROFESSIONAL OBSERVATIONS:
    - Key insights a dermatologist would note
    - Priority areas for treatment

    Return the analysis in this exact JSON format:
    {
      "skinType": "string",
      "skinTone": "string", 
      "undertone": "string",
      "textureQuality": "string",
      "estimatedAge": number,
      "skinScore": number (0-100),
      "concerns": [
        {
          "type": "string",
          "severity": number (1-10),
          "locations": ["string"],
          "confidence": number (0-1)
        }
      ],
      "positiveAttributes": ["string"],
      "problemAreas": {
        "forehead": ["concerns"],
        "cheeks": ["concerns"],
        "nose": ["concerns"],
        "chin": ["concerns"],
        "underEye": ["concerns"]
      },
      "professionalObservations": ["string"],
      "priorityTreatmentAreas": ["string"]
    }`;

    const result = await models.photoAnalysis.generateContent([
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: photoBase64
        }
      },
      prompt
    ]);

    const response = await result.response;
    const text = response.text();
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Photo analysis error:', error);
    throw error;
  }
};

// Analyze combined photo + profile data
const performComprehensiveAnalysis = async (userId, photoAnalysis, profileData) => {
  try {
    const prompt = `You are a world-renowned dermatologist with 20+ years of experience. 
    Analyze this comprehensive patient data and provide expert skincare recommendations.

    PHOTO ANALYSIS RESULTS:
    ${JSON.stringify(photoAnalysis, null, 2)}

    PATIENT PROFILE:
    ${JSON.stringify(profileData, null, 2)}

    Provide a comprehensive analysis that will be used to filter and select products.
    Focus on specific ingredients and product types needed.`;

    // Use regular generation without schema for better flexibility
    const result = await models.comprehensive.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('🧠 Comprehensive Analysis Response:', text.substring(0, 300) + '...');
    
    // Parse the response more flexibly
    try {
      // Try to extract JSON if the model returns it
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      // If not JSON, parse the text response
      console.log('Response is not JSON, parsing text...');
    }
    
    // Create structured data from text response
    const analysis = {
      overallAssessment: {
        primaryDiagnosis: extractSection(text, 'diagnosis', 'Comprehensive skincare analysis'),
        skinTypeConfirmation: profileData.skin_type || 'combination',
        severityLevel: extractSection(text, 'severity', 'moderate'),
        progressPotential: '+20% improvement expected'
      },
      treatmentPlan: {
        priorities: extractPriorities(text, photoAnalysis),
        approach: extractSection(text, 'approach', 'Gentle yet effective treatment')
      },
      ingredientRecommendations: {
        mustHave: extractIngredients(text, 'must have', profileData),
        beneficial: extractIngredients(text, 'beneficial', profileData),
        avoid: [...(profileData.known_allergies || []), 'fragrance', 'alcohol']
      },
      routineStructure: {
        morning: {
          steps: [
            { step: 1, productType: 'cleanser', purpose: 'Remove overnight buildup' },
            { step: 2, productType: 'serum', purpose: 'Target specific concerns' },
            { step: 3, productType: 'moisturizer', purpose: 'Hydrate and protect' },
            { step: 4, productType: 'sunscreen', purpose: 'UV protection' }
          ]
        },
        evening: {
          steps: [
            { step: 1, productType: 'cleanser', purpose: 'Remove day impurities' },
            { step: 2, productType: 'treatment', purpose: 'Active ingredients' },
            { step: 3, productType: 'moisturizer', purpose: 'Night repair' }
          ]
        }
      }
    };
    
    console.log('✅ Successfully created comprehensive analysis');
    return analysis;
  } catch (error) {
    console.error('Comprehensive analysis error:', error);
    // Return a default analysis structure
    return createDefaultAnalysis(profileData, photoAnalysis);
  }
};

// Helper functions for parsing text responses
const extractSection = (text, keyword, defaultValue) => {
  const regex = new RegExp(`${keyword}[:\\s]+([^\\n]+)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : defaultValue;
};

const extractPriorities = (text, photoAnalysis) => {
  const concerns = photoAnalysis?.concerns || [];
  return concerns
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3)
    .map((concern, index) => ({
      concern: concern.type,
      severity: concern.severity >= 7 ? 'high' : concern.severity >= 4 ? 'moderate' : 'low',
      priority: index + 1
    }));
};

const extractIngredients = (text, type, profileData) => {
  // Based on skin concerns, return appropriate ingredients
  const ingredients = [];
  
  if (profileData.primary_skin_concerns?.includes('acne')) {
    ingredients.push({ ingredient: 'Salicylic Acid', purpose: 'Acne treatment', concentration: '1-2%' });
    ingredients.push({ ingredient: 'Niacinamide', purpose: 'Oil control', concentration: '5-10%' });
  }
  
  if (profileData.primary_skin_concerns?.includes('dark_spots')) {
    ingredients.push({ ingredient: 'Vitamin C', purpose: 'Brightening', concentration: '10-20%' });
    ingredients.push({ ingredient: 'Niacinamide', purpose: 'Even skin tone', concentration: '5-10%' });
  }
  
  if (profileData.primary_skin_concerns?.includes('large_pores')) {
    ingredients.push({ ingredient: 'Niacinamide', purpose: 'Pore minimizing', concentration: '5-10%' });
    ingredients.push({ ingredient: 'BHA', purpose: 'Pore cleaning', concentration: '1-2%' });
  }
  
  return type === 'must have' ? ingredients.slice(0, 3) : ingredients.slice(3, 5);
};

const createDefaultAnalysis = (profileData, photoAnalysis) => {
  return {
    overallAssessment: {
      primaryDiagnosis: 'Comprehensive skincare needed',
      skinTypeConfirmation: profileData.skin_type || 'combination',
      severityLevel: 'moderate',
      progressPotential: '+20% improvement expected'
    },
    treatmentPlan: {
      priorities: (profileData.primary_skin_concerns || []).map((concern, idx) => ({
        concern,
        severity: 'moderate',
        priority: idx + 1
      })),
      approach: 'Balanced skincare routine'
    },
    ingredientRecommendations: {
      mustHave: [
        { ingredient: 'Niacinamide', purpose: 'Multi-benefit', concentration: '5-10%' },
        { ingredient: 'Hyaluronic Acid', purpose: 'Hydration', concentration: '1-2%' }
      ],
      beneficial: ['Vitamin C', 'Retinol'],
      avoid: profileData.known_allergies || []
    },
    routineStructure: {
      morning: {
        steps: [
          { step: 1, productType: 'cleanser', purpose: 'Cleanse' },
          { step: 2, productType: 'serum', purpose: 'Treatment' },
          { step: 3, productType: 'moisturizer', purpose: 'Hydrate' },
          { step: 4, productType: 'sunscreen', purpose: 'Protect' }
        ]
      },
      evening: {
        steps: [
          { step: 1, productType: 'cleanser', purpose: 'Cleanse' },
          { step: 2, productType: 'treatment', purpose: 'Active treatment' },
          { step: 3, productType: 'moisturizer', purpose: 'Night repair' }
        ]
      }
    }
  };
};

// Save AI analysis results to database
const saveAIAnalysisResults = async (userId, photoAnalysisId, photoAnalysis, comprehensiveAnalysis) => {
  try {
    console.log('💾 Attempting to save AI analysis results for user:', userId);
    
    // Extract key insights for filtering
    const recommendedIngredients = comprehensiveAnalysis.ingredientRecommendations?.mustHave?.map(i => i.ingredient) || [];
    const ingredientsToAvoid = comprehensiveAnalysis.ingredientRecommendations?.avoid || [];
    const skinConcerns = comprehensiveAnalysis.treatmentPlan?.priorities?.map(p => p.concern) || [];
    const productTypesNeeded = [
      ...comprehensiveAnalysis.routineStructure?.morning?.steps?.map(s => s.productType) || [],
      ...comprehensiveAnalysis.routineStructure?.evening?.steps?.map(s => s.productType) || []
    ];

    const insertData = {
      user_id: userId,
      photo_analysis_id: photoAnalysisId,
      photo_analysis_data: photoAnalysis,
      comprehensive_analysis_data: comprehensiveAnalysis,
      recommended_ingredients: recommendedIngredients,
      ingredients_to_avoid: ingredientsToAvoid,
      skin_concerns: skinConcerns,
      product_types_needed: [...new Set(productTypesNeeded)],
      routine_preferences: {
        morning_steps: comprehensiveAnalysis.routineStructure?.morning?.steps?.length || 0,
        evening_steps: comprehensiveAnalysis.routineStructure?.evening?.steps?.length || 0,
        philosophy: comprehensiveAnalysis.overallAssessment?.primaryDiagnosis
      }
    };

    const { data, error } = await supabase
      .from('ai_analysis_results')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase insert error:', error);
      throw error;
    }
    
    console.log('✅ AI analysis results saved to database with ID:', data.id);
    return data;
  } catch (error) {
    console.error('❌ Save AI analysis error:', error);
    throw error;
  }
};

// Match products using rule-based filtering + AI selection
const matchProductsWithAI = async (aiRecommendations, userProfile) => {
  try {
    console.log('🎯 Starting hybrid product matching (Rule-based + AI)...');
    
    // Step 1: Use rule-based filtering to narrow down products
    const filterResults = await filterProductsForUser(aiRecommendations, userProfile, {
      maxProductsPerCategory: 10, // Increased to ensure enough products
      budgetFilter: true,
      strictIngredientFiltering: false // Less strict to ensure we get products
    });

    console.log(`📊 Rule-based filtering results:
    - Total products filtered: ${filterResults.totalFiltered}
    - Categories found: ${Object.keys(filterResults.productsByCategory).length}
    `);

    if (filterResults.totalFiltered === 0) {
      console.warn('⚠️ No products passed rule-based filtering, using fallback...');
      // Fallback: get some products directly
      const { data: fallbackProducts } = await supabase
        .from('products')
        .select('*')
        .not('product_name', 'is', null)
        .not('price_mrp', 'is', null)
        .limit(50);
      
      return groupProductsByTypeForAI(fallbackProducts || []);
    }

    // Step 2: Convert to the format expected by AI selection
    const productsByType = {};
    Object.entries(filterResults.productsByCategory).forEach(([category, products]) => {
      const mappedType = mapCategoryToProductType(category);
      productsByType[mappedType] = products.map(product => ({
        ...product,
        matchScore: product.score,
        matchReasons: product.matchReasons
      }));
    });

    console.log('✅ Products ready for AI selection:', Object.keys(productsByType).map(type => 
      `${type}: ${productsByType[type].length}`
    ).join(', '));

    return productsByType;
  } catch (error) {
    console.error('Hybrid product matching error:', error);
    throw error;
  }
};

// Group products by type for AI
const groupProductsByTypeForAI = (products) => {
  const grouped = {};
  
  products.forEach(product => {
    const type = detectProductType(product);
    if (!grouped[type]) {
      grouped[type] = [];
    }
    grouped[type].push(product);
  });
  
  return grouped;
};

// Detect product type from name/category
const detectProductType = (product) => {
  const name = (product.product_name || '').toLowerCase();
  const category = (product.category_path || '').toLowerCase();
  
  if (name.includes('cleanser') || category.includes('cleanser')) return 'cleanser';
  if (name.includes('serum') || category.includes('serum')) return 'serum';
  if (name.includes('moisturizer') || name.includes('cream')) return 'moisturizer';
  if (name.includes('sunscreen') || name.includes('spf')) return 'sunscreen';
  if (name.includes('toner')) return 'toner';
  if (name.includes('mask')) return 'treatment';
  
  return 'treatment';
};

// Map detected categories to AI routine product types
const mapCategoryToProductType = (category) => {
  const categoryMap = {
    'cleanser': 'cleanser',
    'serum': 'serum', 
    'moisturizer': 'moisturizer',
    'sunscreen': 'sunscreen',
    'toner': 'toner',
    'exfoliant': 'treatment',
    'mask': 'treatment',
    'oil': 'treatment',
    'other': 'treatment'
  };
  return categoryMap[category] || 'treatment';
};

// Final product selection with AI - FIXED to prevent hallucination
const selectFinalProductsWithAI = async (productsByType, aiRecommendations, userProfile) => {
  try {
    // Create a simplified product list with REAL IDs
    const availableProducts = [];
    Object.entries(productsByType).forEach(([type, products]) => {
      products.forEach(product => {
        availableProducts.push({
          id: product.product_id, // REAL product ID
          name: product.product_name,
          brand: product.brand_name,
          type: type,
          price: product.price_mrp,
          ingredients: product.ingredients_extracted
        });
      });
    });

    console.log(`🤖 Sending ${availableProducts.length} real products to AI for selection`);
    console.log('Sample product IDs:', availableProducts.slice(0, 3).map(p => p.id));

    const prompt = `You are a skincare expert selecting products for a customer.

CUSTOMER NEEDS:
- Skin Type: ${userProfile.skin_type}
- Concerns: ${userProfile.primary_skin_concerns?.join(', ')}
- Allergies: ${userProfile.known_allergies?.join(', ') || 'none'}
- Budget: ${userProfile.budget_range}

AVAILABLE PRODUCTS (YOU MUST ONLY SELECT FROM THIS LIST):
${JSON.stringify(availableProducts, null, 2)}

CRITICAL RULES:
1. ONLY select products from the AVAILABLE PRODUCTS list above
2. Use the EXACT "id" field from each product (do NOT create new IDs)
3. Select 3-4 products for morning, 3-4 for evening
4. Each product ID must exist in the list above

Create morning and evening routines using ONLY the products listed above.`;

    const result = await models.recommendation.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('🤖 AI Response preview:', text.substring(0, 500) + '...');
    
    // Parse response and validate product IDs
    let recommendations;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        recommendations = JSON.parse(jsonMatch[0]);
      } else {
        // Create manual parsing if needed
        recommendations = parseTextResponse(text, availableProducts);
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      // Fallback: manually select products
      recommendations = createFallbackRecommendations(availableProducts, userProfile);
    }

    // Validate that all product IDs are real
    const validProductIds = new Set(availableProducts.map(p => p.id));
    
    if (recommendations.morningRoutine) {
      recommendations.morningRoutine = recommendations.morningRoutine
        .filter(p => {
          const isValid = validProductIds.has(p.productId);
          if (!isValid) {
            console.warn(`❌ Removing invalid product ID: ${p.productId}`);
          }
          return isValid;
        });
    }
    
    if (recommendations.eveningRoutine) {
      recommendations.eveningRoutine = recommendations.eveningRoutine
        .filter(p => {
          const isValid = validProductIds.has(p.productId);
          if (!isValid) {
            console.warn(`❌ Removing invalid product ID: ${p.productId}`);
          }
          return isValid;
        });
    }

    console.log('✅ Final validated recommendations:', {
      morning: recommendations.morningRoutine?.length || 0,
      evening: recommendations.eveningRoutine?.length || 0
    });

    return recommendations;

  } catch (error) {
    console.error('❌ Final product selection error:', error);
    // Return fallback recommendations
    return createFallbackRecommendations(
      Object.values(productsByType).flat(),
      userProfile
    );
  }
};

// Create fallback recommendations using real products
const createFallbackRecommendations = (products, userProfile) => {
  console.log('📦 Creating fallback recommendations from', products.length, 'products');
  
  const morningProducts = [];
  const eveningProducts = [];
  
  // Find cleansers
  const cleansers = products.filter(p => 
    p.product_name?.toLowerCase().includes('cleanser') ||
    p.category_path?.toLowerCase().includes('cleanser')
  );
  
  // Find serums (prioritize niacinamide for oily skin)
  const serums = products.filter(p => 
    p.product_name?.toLowerCase().includes('serum') ||
    p.category_path?.toLowerCase().includes('serum')
  ).sort((a, b) => {
    // Prioritize niacinamide products
    const aHasNiacinamide = JSON.stringify(a.ingredients_extracted || '').toLowerCase().includes('niacinamide');
    const bHasNiacinamide = JSON.stringify(b.ingredients_extracted || '').toLowerCase().includes('niacinamide');
    return bHasNiacinamide - aHasNiacinamide;
  });
  
  // Find moisturizers
  const moisturizers = products.filter(p => 
    p.product_name?.toLowerCase().includes('moisturizer') ||
    p.product_name?.toLowerCase().includes('cream') ||
    p.category_path?.toLowerCase().includes('moisturizer')
  );
  
  // Build morning routine
  if (cleansers.length > 0) {
    morningProducts.push({
      productId: cleansers[0].product_id,
      productName: cleansers[0].product_name,
      brandName: cleansers[0].brand_name,
      productType: 'cleanser',
      price: Number(cleansers[0].price_mrp) || 0,
      applicationOrder: 1,
      keyIngredients: extractIngredientNames(cleansers[0].ingredients_extracted),
      whyRecommended: 'Gentle cleansing to start your day',
      howToUse: 'Massage onto wet face for 30 seconds, rinse thoroughly',
      expectedResults: 'Clean, refreshed skin',
      timeToSeeResults: '1-2 weeks'
    });
  }
  
  if (serums.length > 0) {
    morningProducts.push({
      productId: serums[0].product_id,
      productName: serums[0].product_name,
      brandName: serums[0].brand_name,
      productType: 'serum',
      price: Number(serums[0].price_mrp) || 0,
      applicationOrder: 2,
      keyIngredients: extractIngredientNames(serums[0].ingredients_extracted),
      whyRecommended: 'Targets your specific skin concerns',
      howToUse: 'Apply 2-3 drops to clean face',
      expectedResults: 'Improved skin texture and tone',
      timeToSeeResults: '4-6 weeks'
    });
  }
  
  if (moisturizers.length > 0) {
    morningProducts.push({
      productId: moisturizers[0].product_id,
      productName: moisturizers[0].product_name,
      brandName: moisturizers[0].brand_name,
      productType: 'moisturizer',
      price: Number(moisturizers[0].price_mrp) || 0,
      applicationOrder: 3,
      keyIngredients: extractIngredientNames(moisturizers[0].ingredients_extracted),
      whyRecommended: 'Hydration and protection throughout the day',
      howToUse: 'Apply evenly to face and neck',
      expectedResults: 'Hydrated, protected skin',
      timeToSeeResults: 'Immediate'
    });
  }
  
  // Evening routine (use different products if available)
  const eveningCleanser = cleansers.length > 1 ? cleansers[1] : cleansers[0];
  const eveningSerum = serums.length > 1 ? serums[1] : serums[0];
  const eveningMoisturizer = moisturizers.length > 1 ? moisturizers[1] : moisturizers[0];
  
  if (eveningCleanser) {
    eveningProducts.push({
      productId: eveningCleanser.product_id,
      productName: eveningCleanser.product_name,
      brandName: eveningCleanser.brand_name,
      productType: 'cleanser',
      price: Number(eveningCleanser.price_mrp) || 0,
      applicationOrder: 1,
      keyIngredients: extractIngredientNames(eveningCleanser.ingredients_extracted),
      whyRecommended: 'Remove impurities from the day',
      howToUse: 'Double cleanse if wearing makeup',
      expectedResults: 'Deep cleaned skin',
      timeToSeeResults: 'Immediate'
    });
  }
  
  if (eveningSerum) {
    eveningProducts.push({
      productId: eveningSerum.product_id,
      productName: eveningSerum.product_name,
      brandName: eveningSerum.brand_name,
      productType: 'treatment',
      price: Number(eveningSerum.price_mrp) || 0,
      applicationOrder: 2,
      keyIngredients: extractIngredientNames(eveningSerum.ingredients_extracted),
      whyRecommended: 'Night treatment for skin repair',
      howToUse: 'Apply after cleansing',
      expectedResults: 'Targeted treatment while you sleep',
      timeToSeeResults: '4-8 weeks'
    });
  }
  
  return {
    morningRoutine: morningProducts,
    eveningRoutine: eveningProducts,
    overallPhilosophy: 'A balanced routine for your skin needs',
    expectedTimeline: '4-6 weeks for visible improvements',
    proTips: [
      'Always use sunscreen during the day',
      'Be consistent with your routine',
      'Introduce new products gradually'
    ]
  };
};

// Extract ingredient names helper
const extractIngredientNames = (ingredients) => {
  if (!ingredients) return [];
  
  if (Array.isArray(ingredients)) {
    return ingredients
      .map(i => i.name || i.ingredient || '')
      .filter(name => name.length > 0)
      .slice(0, 5); // Top 5 ingredients
  }
  
  return [];
};

// Parse text response if JSON parsing fails
const parseTextResponse = (text, availableProducts) => {
  // This is a fallback parser - in production, you'd want more robust parsing
  const recommendations = {
    morningRoutine: [],
    eveningRoutine: [],
    overallPhilosophy: 'Personalized skincare routine',
    expectedTimeline: '4-6 weeks',
    proTips: []
  };
  
  // Try to find product mentions in the text
  availableProducts.forEach(product => {
    if (text.includes(product.name) || text.includes(product.id)) {
      const routineProduct = {
        productId: product.id,
        productName: product.name,
        brandName: product.brand,
        productType: product.type,
        price: product.price,
        applicationOrder: recommendations.morningRoutine.length + 1,
        keyIngredients: [],
        whyRecommended: 'Recommended for your skin type',
        howToUse: 'Use as directed',
        expectedResults: 'Improved skin health',
        timeToSeeResults: '4-6 weeks'
      };
      
      if (text.toLowerCase().includes('morning') && recommendations.morningRoutine.length < 4) {
        recommendations.morningRoutine.push(routineProduct);
      } else if (recommendations.eveningRoutine.length < 4) {
        recommendations.eveningRoutine.push(routineProduct);
      }
    }
  });
  
  return recommendations;
};

module.exports = {
  analyzePhotoWithAI,
  performComprehensiveAnalysis,
  matchProductsWithAI,
  selectFinalProductsWithAI,
  saveAIAnalysisResults
};