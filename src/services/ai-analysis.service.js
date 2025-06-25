const { models } = require('../config/gemini');
const supabase = require('../config/supabase');

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

    Provide a comprehensive analysis including:

    1. SKIN CONDITION ASSESSMENT:
    - Overall skin health score (0-100)
    - How lifestyle factors are affecting their skin
    - Connection between concerns and habits

    2. KEY INGREDIENTS NEEDED:
    - List specific ingredients that would benefit this person
    - Explain why each ingredient is recommended
    - Ingredients to avoid based on sensitivities

    3. TREATMENT PRIORITIES:
    - Rank concerns by importance
    - Expected timeline for improvements
    - Lifestyle changes needed

    4. ROUTINE RECOMMENDATIONS:
    - Morning routine structure
    - Evening routine structure
    - Weekly treatments needed
    - Product types needed for each step

    5. PERSONALIZED INSIGHTS:
    - How climate/environment affects their skin
    - Impact of stress/sleep on skin condition
    - Dietary recommendations

    Return response in this JSON format:
    {
      "overallAssessment": {
        "skinHealthScore": number,
        "primaryDiagnosis": "string",
        "secondaryFactors": ["string"]
      },
      "ingredientRecommendations": {
        "mustHave": [
          {
            "ingredient": "string",
            "reason": "string",
            "targetsConcern": "string"
          }
        ],
        "beneficial": ["string"],
        "avoid": ["string"]
      },
      "treatmentPlan": {
        "priorities": [
          {
            "concern": "string",
            "urgency": "high/medium/low",
            "expectedTimeline": "string"
          }
        ],
        "lifestyleChanges": ["string"]
      },
      "routineStructure": {
        "morning": {
          "steps": [
            {
              "step": number,
              "productType": "string",
              "keyIngredients": ["string"],
              "purpose": "string"
            }
          ]
        },
        "evening": {
          "steps": [
            {
              "step": number,
              "productType": "string",
              "keyIngredients": ["string"],
              "purpose": "string"
            }
          ]
        },
        "weekly": ["string"]
      },
      "personalizedInsights": {
        "environmentalFactors": ["string"],
        "lifestyleImpact": ["string"],
        "dietaryTips": ["string"]
      }
    }`;

    const result = await models.recommendation.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Comprehensive analysis error:', error);
    throw error;
  }
};

// Match products based on AI recommendations
const matchProductsWithAI = async (aiRecommendations, userProfile) => {
  try {
    // Extract all recommended ingredients
    const mustHaveIngredients = aiRecommendations.ingredientRecommendations.mustHave.map(i => i.ingredient);
    const beneficialIngredients = aiRecommendations.ingredientRecommendations.beneficial;
    const avoidIngredients = aiRecommendations.ingredientRecommendations.avoid;

    // Build query for products
    let query = supabase
      .from('products')
      .select('*')
      .not('ingredients_extracted', 'is', null)
      .not('benefits_extracted', 'is', null);

    // Add budget filter if specified
    if (userProfile.budget_range) {
      const budgetMap = {
        'budget': [0, 30],
        'mid_range': [20, 80],
        'luxury': [50, 500],
        'mixed': [0, 500]
      };
      const [min, max] = budgetMap[userProfile.budget_range] || [0, 500];
      query = query.gte('price_mrp', min).lte('price_mrp', max);
    }

    // Get all products
    const { data: products, error } = await query.limit(500);

    if (error) throw error;

    // Score and rank products
    const scoredProducts = products.map(product => {
      let score = 0;
      const reasons = [];

      try {
        // Check ingredients
        const productIngredients = product.ingredients_extracted || [];
        let ingredientNames = [];
        
        if (Array.isArray(productIngredients)) {
          ingredientNames = productIngredients
            .map(i => {
              if (typeof i === 'object' && i !== null) {
                const name = i.name || i.ingredient || i.original_name || '';
                return typeof name === 'string' ? name.toLowerCase() : '';
              }
              return typeof i === 'string' ? i.toLowerCase() : '';
            })
            .filter(name => name.length > 0);
        } else if (typeof productIngredients === 'object' && productIngredients !== null) {
          // Handle case where ingredients_extracted is an object instead of array
          ingredientNames = Object.values(productIngredients)
            .map(i => {
              if (typeof i === 'object' && i !== null) {
                const name = i.name || i.ingredient || i.original_name || '';
                return typeof name === 'string' ? name.toLowerCase() : '';
              }
              return typeof i === 'string' ? i.toLowerCase() : '';
            })
            .filter(name => name.length > 0);
        } else if (typeof productIngredients === 'string') {
          ingredientNames = [productIngredients.toLowerCase()];
        } else {
          console.log(`Unexpected ingredients_extracted type for product ${product.id}:`, typeof productIngredients, productIngredients);
        }

        // Check must-have ingredients (highest weight)
        mustHaveIngredients.forEach(ingredient => {
          if (ingredientNames.some(pi => pi.includes(ingredient.toLowerCase()))) {
            score += 30;
            reasons.push(`Contains ${ingredient}`);
          }
        });

        // Check beneficial ingredients
        beneficialIngredients.forEach(ingredient => {
          if (ingredientNames.some(pi => pi.includes(ingredient.toLowerCase()))) {
            score += 10;
            reasons.push(`Contains beneficial ${ingredient}`);
          }
        });

        // Deduct for avoid ingredients
        avoidIngredients.forEach(ingredient => {
          if (ingredientNames.some(pi => pi.includes(ingredient.toLowerCase()))) {
            score -= 50;
            reasons.push(`Contains ${ingredient} (should avoid)`);
          }
        });

        // Check benefits match
        const benefits = product.benefits_extracted || [];
        let benefitText = '';
        
        if (Array.isArray(benefits)) {
          benefitText = benefits
            .map(b => {
              if (typeof b === 'object' && b !== null) {
                const benefit = b.benefit || b.name || '';
                return typeof benefit === 'string' ? benefit : '';
              }
              return typeof b === 'string' ? b : '';
            })
            .filter(text => text.length > 0)
            .join(' ').toLowerCase();
        } else if (typeof benefits === 'object' && benefits !== null) {
          // Handle case where benefits_extracted is an object instead of array
          benefitText = Object.values(benefits)
            .filter(v => typeof v === 'string' && v.length > 0)
            .join(' ').toLowerCase();
        } else if (typeof benefits === 'string') {
          benefitText = benefits.toLowerCase();
        }

        // Match with user concerns
        if (userProfile.primary_skin_concerns) {
          userProfile.primary_skin_concerns.forEach(concern => {
            if (benefitText.includes(concern.toLowerCase())) {
              score += 20;
              reasons.push(`Targets ${concern}`);
            }
          });
        }

        // Category scoring
        const categoryPath = (product.category_path || '').toLowerCase();
        const routineSteps = [
          ...aiRecommendations.routineStructure.morning.steps,
          ...aiRecommendations.routineStructure.evening.steps
        ];

        routineSteps.forEach(step => {
          if (categoryPath.includes(step.productType.toLowerCase())) {
            score += 15;
            reasons.push(`Matches ${step.productType} need`);
          }
        });

      } catch (error) {
        console.error(`Error processing product ${product.id}:`, error);
        // Return product with 0 score if there's an error
      }

      return {
        ...product,
        matchScore: score,
        matchReasons: reasons
      };
    });

    // Sort by score
    scoredProducts.sort((a, b) => b.matchScore - a.matchScore);

    // Group by product type for routine building
    const productsByType = {};
    const routineTypes = [...new Set([
      ...aiRecommendations.routineStructure.morning.steps.map(s => s.productType),
      ...aiRecommendations.routineStructure.evening.steps.map(s => s.productType)
    ])];

    routineTypes.forEach(type => {
      productsByType[type] = scoredProducts
        .filter(p => {
          const category = (p.category_path || '').toLowerCase();
          return category.includes(type.toLowerCase()) && p.matchScore > 0;
        })
        .slice(0, 3); // Top 3 per category
    });

    return productsByType;
  } catch (error) {
    console.error('Product matching error:', error);
    throw error;
  }
};

// Final product selection with AI
const selectFinalProductsWithAI = async (productsByType, aiRecommendations, userProfile) => {
  try {
    const prompt = `You are a skincare expert selecting the best products for a customer.

    CUSTOMER PROFILE:
    ${JSON.stringify({
      concerns: userProfile.primary_skin_concerns,
      skinType: userProfile.skin_type,
      sensitivity: userProfile.skin_sensitivity,
      budget: userProfile.budget_range
    }, null, 2)}

    AI RECOMMENDATIONS:
    ${JSON.stringify(aiRecommendations, null, 2)}

    AVAILABLE PRODUCTS BY TYPE:
    ${JSON.stringify(productsByType, null, 2)}

    Select the BEST 8 products total for morning and evening routines.
    
    For each product selected, provide:
    1. Why it's perfect for this person
    2. How to use it
    3. Expected results
    4. Which routine (morning/evening) and order

    Return in this JSON format:
    {
      "morningRoutine": [
        {
          "productId": "string",
          "productName": "string",
          "brandName": "string",
          "productType": "string",
          "price": number,
          "applicationOrder": number,
          "keyIngredients": ["string"],
          "whyRecommended": "string",
          "howToUse": "string",
          "expectedResults": "string",
          "timeToSeeResults": "string"
        }
      ],
      "eveningRoutine": [same structure],
      "overallPhilosophy": "string",
      "expectedTimeline": "string",
      "proTips": ["string"]
    }`;

    const result = await models.recommendation.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from AI response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Final product selection error:', error);
    throw error;
  }
};

module.exports = {
  analyzePhotoWithAI,
  performComprehensiveAnalysis,
  matchProductsWithAI,
  selectFinalProductsWithAI
}; 