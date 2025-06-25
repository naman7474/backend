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

    // Define JSON schema for comprehensive analysis
    const comprehensiveSchema = {
      type: "object",
      properties: {
        overallAssessment: {
          type: "object",
          properties: {
            primaryDiagnosis: { type: "string" },
            skinTypeConfirmation: { type: "string" },
            severityLevel: { type: "string" },
            progressPotential: { type: "string" }
          },
          required: ["primaryDiagnosis", "skinTypeConfirmation"]
        },
        treatmentPlan: {
          type: "object",
          properties: {
            priorities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  concern: { type: "string" },
                  severity: { type: "string" },
                  priority: { type: "integer" }
                },
                required: ["concern", "severity", "priority"]
              }
            },
            approach: { type: "string" }
          },
          required: ["priorities", "approach"]
        },
        ingredientRecommendations: {
          type: "object",
          properties: {
            mustHave: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ingredient: { type: "string" },
                  purpose: { type: "string" },
                  concentration: { type: "string" }
                },
                required: ["ingredient", "purpose"]
              }
            },
            beneficial: {
              type: "array", 
              items: { type: "string" }
            },
            avoid: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["mustHave", "beneficial", "avoid"]
        },
        routineStructure: {
          type: "object",
          properties: {
            morning: {
              type: "object",
              properties: {
                steps: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      step: { type: "integer" },
                      productType: { type: "string" },
                      purpose: { type: "string" }
                    },
                    required: ["step", "productType", "purpose"]
                  }
                }
              },
              required: ["steps"]
            },
            evening: {
              type: "object", 
              properties: {
                steps: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      step: { type: "integer" },
                      productType: { type: "string" },
                      purpose: { type: "string" }
                    },
                    required: ["step", "productType", "purpose"]
                  }
                }
              },
              required: ["steps"]
            }
          },
          required: ["morning", "evening"]
        }
      },
      required: ["overallAssessment", "treatmentPlan", "ingredientRecommendations", "routineStructure"]
    };

    const result = await models.comprehensive.generateContent({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: comprehensiveSchema
      }
    });

    const response = await result.response;
    const jsonText = response.text();
    
    console.log('🧠 Structured Comprehensive Analysis Response:', jsonText.substring(0, 300) + '...');
    
    // Parse the structured JSON response
    const parsedResponse = JSON.parse(jsonText);
    
    console.log('✅ Successfully parsed comprehensive analysis response');
    return parsedResponse;
  } catch (error) {
    console.error('Comprehensive analysis error:', error);
    throw error;
  }
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

    console.log('📋 Extracted data for saving:');
    console.log('- Recommended ingredients:', recommendedIngredients);
    console.log('- Ingredients to avoid:', ingredientsToAvoid);
    console.log('- Skin concerns:', skinConcerns);
    console.log('- Product types needed:', [...new Set(productTypesNeeded)]);

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
    console.error('Error details:', error.message);
    throw error;
  }
};

// Match products using rule-based filtering + AI selection
const matchProductsWithAI = async (aiRecommendations, userProfile) => {
  try {
    console.log('🎯 Starting hybrid product matching (Rule-based + AI)...');
    
    // Step 1: Use rule-based filtering to narrow down products
    const filterResults = await filterProductsForUser(aiRecommendations, userProfile, {
      maxProductsPerCategory: 8, // Limit per category for AI processing
      budgetFilter: true,
      strictIngredientFiltering: true
    });

    console.log(`📊 Rule-based filtering results:
    - Total products filtered: ${filterResults.totalFiltered}
    - Categories found: ${Object.keys(filterResults.productsByCategory).length}
    - Average score: ${filterResults.summary.averageScore?.toFixed(1)}
    `);

    if (filterResults.totalFiltered === 0) {
      console.warn('⚠️ No products passed rule-based filtering');
      return {};
    }

    // Step 2: Convert to the format expected by AI selection
    const productsByType = {};
    Object.entries(filterResults.productsByCategory).forEach(([category, products]) => {
      // Map our detected categories to AI routine product types
      const mappedType = mapCategoryToProductType(category);
      productsByType[mappedType] = products.map(product => ({
        ...product,
        matchScore: product.score, // Use our rule-based score
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

// Map detected categories to AI routine product types
const mapCategoryToProductType = (category) => {
  const categoryMap = {
    'cleanser': 'cleanser',
    'serum': 'serum', 
    'moisturizer': 'moisturizer',
    'sunscreen': 'sunscreen',
    'toner': 'toner',
    'exfoliant': 'exfoliant',
    'mask': 'treatment',
    'oil': 'oil',
    'other': 'treatment'
  };
  return categoryMap[category] || category;
};

// Final product selection with AI using structured output
const selectFinalProductsWithAI = async (productsByType, aiRecommendations, userProfile) => {
  try {
    const prompt = `You are a skincare expert selecting the best products for a customer.

    CUSTOMER PROFILE:
    - Skin Type: ${userProfile.skin_type}
    - Primary Concerns: ${userProfile.primary_skin_concerns?.join(', ')}
    - Sensitivity: ${userProfile.skin_sensitivity}
    - Budget: ${userProfile.budget_range}

    AVAILABLE PRODUCTS BY TYPE:
    ${JSON.stringify(productsByType, null, 2)}

    CRITICAL INSTRUCTIONS:
    1. You MUST ONLY select products from the AVAILABLE PRODUCTS list above
    2. Use the EXACT product_id field value from each product
    3. Select 3-5 products for morning routine, 3-5 for evening routine
    4. NEVER create fictional product IDs

    Select the BEST products available for morning and evening routines based on the customer's needs.`;

    // Define the JSON schema for structured output
    const schema = {
      type: "object",
      properties: {
        morningRoutine: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productId: { type: "string" },
              productName: { type: "string" },
              brandName: { type: "string" },
              productType: { type: "string" },
              price: { type: "number" },
              applicationOrder: { type: "integer" },
              keyIngredients: {
                type: "array",
                items: { type: "string" }
              },
              whyRecommended: { type: "string" },
              howToUse: { type: "string" },
              expectedResults: { type: "string" },
              timeToSeeResults: { type: "string" }
            },
            required: ["productId", "productName", "brandName", "productType", "price", "applicationOrder"]
          }
        },
        eveningRoutine: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productId: { type: "string" },
              productName: { type: "string" },
              brandName: { type: "string" },
              productType: { type: "string" },
              price: { type: "number" },
              applicationOrder: { type: "integer" },
              keyIngredients: {
                type: "array",
                items: { type: "string" }
              },
              whyRecommended: { type: "string" },
              howToUse: { type: "string" },
              expectedResults: { type: "string" },
              timeToSeeResults: { type: "string" }
            },
            required: ["productId", "productName", "brandName", "productType", "price", "applicationOrder"]
          }
        },
        overallPhilosophy: { type: "string" },
        expectedTimeline: { type: "string" },
        proTips: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["morningRoutine", "eveningRoutine", "overallPhilosophy", "expectedTimeline", "proTips"]
    };

    const result = await models.recommendation.generateContent({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    const response = await result.response;
    const jsonText = response.text();
    
    console.log('🤖 Structured AI Response:', jsonText.substring(0, 300) + '...');
    
    // Parse the structured JSON response
    const parsedResponse = JSON.parse(jsonText);
    
    console.log('✅ Successfully parsed structured AI response');
    return parsedResponse;

  } catch (error) {
    console.error('❌ Final product selection error:', error);
    throw error;
  }
};

module.exports = {
  analyzePhotoWithAI,
  performComprehensiveAnalysis,
  matchProductsWithAI,
  selectFinalProductsWithAI,
  saveAIAnalysisResults
}; 