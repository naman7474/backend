const supabase = require('../config/supabase');

/**
 * Rule-based product filtering service
 * Filters products based on user profile and AI analysis before sending to AI for final selection
 */

// Main filtering function
const filterProductsForUser = async (aiAnalysis, userProfile, options = {}) => {
  try {
    const {
      maxProductsPerCategory = 10,
      budgetFilter = true,
      strictIngredientFiltering = true
    } = options;

    console.log('🔍 Starting rule-based product filtering...');

    // Extract filter criteria from AI analysis
    const filterCriteria = extractFilterCriteria(aiAnalysis, userProfile);
    console.log('📋 Filter criteria:', filterCriteria);

    // Get all products with basic filters
    let query = supabase
      .from('products')
      .select('*')
      .not('product_name', 'is', null)
      .not('price_mrp', 'is', null);

    // Apply budget filter
    if (budgetFilter && filterCriteria.budgetRange) {
      query = query
        .gte('price_mrp', filterCriteria.budgetRange[0])
        .lte('price_mrp', filterCriteria.budgetRange[1]);
    }

    const { data: allProducts, error } = await query.limit(1000);
    if (error) throw error;

    console.log(`📦 Retrieved ${allProducts.length} products for filtering`);

    // Apply rule-based filters
    const filteredProducts = allProducts
      .map(product => scoreProduct(product, filterCriteria))
      .filter(product => product.score > 0) // Remove products with 0 score
      .sort((a, b) => b.score - a.score); // Sort by score descending

    console.log(`✅ Filtered down to ${filteredProducts.length} products`);

    // Log top products for debugging
    if (filteredProducts.length > 0) {
      console.log('🏆 Top filtered products:');
      filteredProducts.slice(0, 5).forEach(p => {
        console.log(`  - ${p.product_id}: ${p.product_name} (Score: ${p.score})`);
      });
    } else {
      console.log('⚠️ No products passed filtering - criteria might be too strict');
    }

    // Group by category and limit per category
    const productsByCategory = groupProductsByCategory(filteredProducts, maxProductsPerCategory);
    
    console.log('📊 Products by category:', Object.keys(productsByCategory).map(cat => 
      `${cat}: ${productsByCategory[cat].length}`
    ).join(', '));

    return {
      filterCriteria,
      productsByCategory,
      totalFiltered: filteredProducts.length,
      summary: generateFilterSummary(filteredProducts, filterCriteria)
    };

  } catch (error) {
    console.error('Product filtering error:', error);
    throw error;
  }
};

// Extract filter criteria from AI analysis and user profile
const extractFilterCriteria = (aiAnalysis, userProfile) => {
  const criteria = {
    // From AI analysis
    mustHaveIngredients: [],
    beneficialIngredients: [],
    avoidIngredients: [],
    skinConcerns: [],
    productTypes: [],
    
    // From user profile
    skinType: userProfile.skin_type,
    skinSensitivity: userProfile.skin_sensitivity,
    allergies: userProfile.known_allergies || [],
    budgetRange: getBudgetRange(userProfile.budget_range),
    
    // Priorities
    primaryConcerns: userProfile.primary_skin_concerns || [],
    secondaryConcerns: userProfile.secondary_skin_concerns || []
  };

  // Extract from AI ingredient recommendations
  if (aiAnalysis.ingredientRecommendations) {
    criteria.mustHaveIngredients = aiAnalysis.ingredientRecommendations.mustHave?.map(i => i.ingredient) || [];
    criteria.beneficialIngredients = aiAnalysis.ingredientRecommendations.beneficial || [];
    criteria.avoidIngredients = aiAnalysis.ingredientRecommendations.avoid || [];
  }

  // Extract product types from routine structure
  if (aiAnalysis.routineStructure) {
    const morningTypes = aiAnalysis.routineStructure.morning?.steps?.map(s => s.productType) || [];
    const eveningTypes = aiAnalysis.routineStructure.evening?.steps?.map(s => s.productType) || [];
    criteria.productTypes = [...new Set([...morningTypes, ...eveningTypes])];
  }

  // Extract concerns from treatment plan
  if (aiAnalysis.treatmentPlan?.priorities) {
    criteria.skinConcerns = aiAnalysis.treatmentPlan.priorities.map(p => p.concern);
  }

  // Add user allergies to avoid list
  criteria.avoidIngredients = [...criteria.avoidIngredients, ...criteria.allergies];

  return criteria;
};

// Score individual product based on ingredient matching only
const scoreProduct = (product, criteria) => {
  let score = 0;
  const reasons = [];

  try {
    // Get product ingredients
    const productIngredients = extractIngredientNames(product.ingredients_extracted);
    
    console.log(`🧪 Scoring product: ${product.product_name}`);
    console.log(`   Ingredients: ${productIngredients.join(', ')}`);

    // MUST AVOID - Immediate disqualification
    for (const avoidIngredient of criteria.avoidIngredients) {
      if (productIngredients.some(ing => ing.toLowerCase().includes(avoidIngredient.toLowerCase()))) {
        score = 0;
        console.log(`   ❌ DISQUALIFIED: Contains ${avoidIngredient} (must avoid)`);
        return { ...product, score, matchReasons: [`Contains ${avoidIngredient} (must avoid)`] };
      }
    }

    // MUST HAVE ingredients (highest priority)
    for (const mustHave of criteria.mustHaveIngredients) {
      if (productIngredients.some(ing => ing.toLowerCase().includes(mustHave.toLowerCase()))) {
        score += 100;
        reasons.push(`Contains required ${mustHave}`);
        console.log(`   ✅ +100: Contains required ${mustHave}`);
      }
    }

    // BENEFICIAL ingredients (medium priority)
    for (const beneficial of criteria.beneficialIngredients) {
      if (productIngredients.some(ing => ing.toLowerCase().includes(beneficial.toLowerCase()))) {
        score += 50;
        reasons.push(`Contains beneficial ${beneficial}`);
        console.log(`   ✅ +50: Contains beneficial ${beneficial}`);
      }
    }

    // Give base score to any skincare product to ensure we have some products
    if (score === 0 && productIngredients.length > 0) {
      score = 10; // Minimum score for valid skincare products
      reasons.push('Valid skincare product');
      console.log(`   ✅ +10: Valid skincare product (base score)`);
    }

    console.log(`   🎯 Final score: ${score}`);
    
    return { ...product, score, matchReasons: reasons };

  } catch (error) {
    console.error(`Error scoring product ${product.product_id}:`, error);
    return { ...product, score: 0, matchReasons: ['Processing error'] };
  }
};

// Helper functions
const extractIngredientNames = (ingredients) => {
  if (!ingredients) return [];
  
  if (Array.isArray(ingredients)) {
    return ingredients
      .map(i => {
        if (typeof i === 'object' && i !== null) {
          return i.name || i.ingredient || i.original_name || '';
        }
        return typeof i === 'string' ? i : '';
      })
      .filter(name => name.length > 0)
      .map(name => name.toLowerCase());
  }
  
  if (typeof ingredients === 'string') {
    return [ingredients.toLowerCase()];
  }
  
  return [];
};

const extractBenefitNames = (benefits) => {
  if (!benefits) return [];
  
  if (Array.isArray(benefits)) {
    return benefits
      .map(b => {
        if (typeof b === 'object' && b !== null) {
          return b.benefit || b.name || '';
        }
        return typeof b === 'string' ? b : '';
      })
      .filter(benefit => benefit.length > 0)
      .map(benefit => benefit.toLowerCase());
  }
  
  if (typeof benefits === 'string') {
    return [benefits.toLowerCase()];
  }
  
  return [];
};

const getBudgetRange = (budgetPreference) => {
  const budgetMap = {
    'budget': [0, 30],
    'mid_range': [20, 80],
    'luxury': [50, 500],
    'mixed': [0, 500]
  };
  return budgetMap[budgetPreference] || [0, 500];
};

const getSkinTypeKeywords = (skinType) => {
  const keywordMap = {
    'Dry & Tight': ['dry', 'hydrating', 'moisturizing', 'nourishing'],
    'Oily & Shiny': ['oily', 'oil-control', 'mattifying', 'sebum'],
    'Combination': ['combination', 'balanced', 'normalize'],
    'Normal & Balanced': ['normal', 'balanced', 'maintain']
  };
  return keywordMap[skinType] || [];
};

const groupProductsByCategory = (products, maxPerCategory) => {
  const categories = {};
  
  products.forEach(product => {
    const category = detectProductCategory(product);
    
    if (!categories[category]) {
      categories[category] = [];
    }
    
    if (categories[category].length < maxPerCategory) {
      categories[category].push(product);
    }
  });
  
  return categories;
};

const detectProductCategory = (product) => {
  const name = (product.product_name || '').toLowerCase();
  const category = (product.category_path || '').toLowerCase();
  
  if (name.includes('cleanser') || category.includes('cleanser')) return 'cleanser';
  if (name.includes('serum') || category.includes('serum')) return 'serum';
  if (name.includes('moisturizer') || name.includes('cream') || category.includes('moisturizer')) return 'moisturizer';
  if (name.includes('sunscreen') || name.includes('spf') || category.includes('sunscreen')) return 'sunscreen';
  if (name.includes('toner') || category.includes('toner')) return 'toner';
  if (name.includes('exfoliant') || name.includes('scrub') || category.includes('exfoliant')) return 'exfoliant';
  if (name.includes('mask') || category.includes('mask')) return 'mask';
  if (name.includes('oil') || category.includes('oil')) return 'oil';
  
  return 'other';
};

const generateFilterSummary = (filteredProducts, criteria) => {
  return {
    totalProducts: filteredProducts.length,
    averageScore: filteredProducts.reduce((sum, p) => sum + p.score, 0) / filteredProducts.length,
    topReasons: getTopMatchReasons(filteredProducts),
    priceRange: {
      min: Math.min(...filteredProducts.map(p => p.price_mrp || 0)),
      max: Math.max(...filteredProducts.map(p => p.price_mrp || 0))
    }
  };
};

const getTopMatchReasons = (products) => {
  const reasonCounts = {};
  
  products.forEach(product => {
    if (product.matchReasons) {
      product.matchReasons.forEach(reason => {
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      });
    }
  });
  
  return Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));
};

module.exports = {
  filterProductsForUser,
  extractFilterCriteria,
  scoreProduct
}; 