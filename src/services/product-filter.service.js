const supabase = require('../config/supabase');

/**
 * Improved rule-based product filtering service
 * More lenient filtering to ensure products are found
 */

// Main filtering function
const filterProductsForUser = async (aiAnalysis, userProfile, options = {}) => {
  try {
    const {
      maxProductsPerCategory = 10,
      budgetFilter = true,
      strictIngredientFiltering = false
    } = options;

    console.log('🔍 Starting rule-based product filtering...');

    // Extract filter criteria from AI analysis
    const filterCriteria = extractFilterCriteria(aiAnalysis, userProfile);
    console.log('📋 Filter criteria:', {
      mustHave: filterCriteria.mustHaveIngredients,
      avoid: filterCriteria.avoidIngredients,
      budget: filterCriteria.budgetRange
    });

    // Get all products with basic filters
    let query = supabase
      .from('products')
      .select('*')
      .not('product_name', 'is', null)
      .not('price_mrp', 'is', null);

    // Apply loose budget filter (expand range by 20%)
    if (budgetFilter && filterCriteria.budgetRange) {
      const [min, max] = filterCriteria.budgetRange;
      query = query
        .gte('price_mrp', min * 0.8)
        .lte('price_mrp', max * 1.2);
    }

    const { data: allProducts, error } = await query.limit(1000);
    if (error) throw error;

    console.log(`📦 Retrieved ${allProducts.length} products for filtering`);

    // Apply rule-based filters with improved scoring
    const filteredProducts = allProducts
      .map(product => scoreProduct(product, filterCriteria, strictIngredientFiltering))
      .filter(product => product.score > 0)
      .sort((a, b) => b.score - a.score);

    console.log(`✅ Filtered down to ${filteredProducts.length} products`);

    // Log top products for debugging
    if (filteredProducts.length > 0) {
      console.log('🏆 Top 5 filtered products:');
      filteredProducts.slice(0, 5).forEach(p => {
        console.log(`  - ${p.product_id}: ${p.product_name} (Score: ${p.score}, Reasons: ${p.matchReasons.join(', ')})`);
      });
    } else {
      console.log('⚠️ No products passed filtering - returning all products as fallback');
      // Return all products with basic scoring
      return {
        filterCriteria,
        productsByCategory: groupProductsByCategory(
          allProducts.map(p => ({ ...p, score: 10, matchReasons: ['Available product'] })),
          maxProductsPerCategory
        ),
        totalFiltered: allProducts.length,
        summary: { averageScore: 10 }
      };
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
    skinSensitivity: userProfile.skin_sensitivity_level,
    allergies: userProfile.known_allergies || [],
    budgetRange: getBudgetRange(userProfile.budget_range),
    
    // Priorities
    primaryConcerns: userProfile.primary_skin_concerns || [],
    secondaryConcerns: userProfile.secondary_skin_concerns || []
  };

  // Extract from AI ingredient recommendations
  if (aiAnalysis.ingredientRecommendations) {
    criteria.mustHaveIngredients = aiAnalysis.ingredientRecommendations.mustHave?.map(i => 
      typeof i === 'string' ? i : i.ingredient
    ) || [];
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
  criteria.avoidIngredients = [...new Set([...criteria.avoidIngredients, ...criteria.allergies])];

  return criteria;
};

// Score individual product based on multiple factors
const scoreProduct = (product, criteria, strict = false) => {
  let score = 0;
  const reasons = [];

  try {
    // Get product ingredients
    const productIngredients = extractIngredientNames(product.ingredients_extracted);
    const productBenefits = extractBenefitNames(product.benefits_extracted);
    const productName = (product.product_name || '').toLowerCase();
    const productCategory = (product.category_path || '').toLowerCase();
    
    // Check for allergens/ingredients to avoid
    for (const avoidIngredient of criteria.avoidIngredients) {
      if (productIngredients.some(ing => ing.includes(avoidIngredient.toLowerCase()))) {
        if (strict) {
          score = 0;
          return { ...product, score, matchReasons: [`Contains ${avoidIngredient} (must avoid)`] };
        } else {
          score -= 50; // Penalty but not disqualification
          reasons.push(`Contains ${avoidIngredient} (should avoid)`);
        }
      }
    }

    // MUST HAVE ingredients (highest priority)
    let hasRequiredIngredient = false;
    for (const mustHave of criteria.mustHaveIngredients) {
      const mustHaveStr = typeof mustHave === 'string' ? mustHave : String(mustHave || '');
      if (mustHaveStr && (
          productIngredients.some(ing => ing.includes(mustHaveStr.toLowerCase())) ||
          productName.includes(mustHaveStr.toLowerCase()))) {
        score += 100;
        hasRequiredIngredient = true;
        reasons.push(`Contains required ${mustHaveStr}`);
      }
    }

    // BENEFICIAL ingredients (medium priority)
    for (const beneficial of criteria.beneficialIngredients) {
      const beneficialStr = typeof beneficial === 'string' ? beneficial : String(beneficial || '');
      if (beneficialStr && (
          productIngredients.some(ing => ing.includes(beneficialStr.toLowerCase())) ||
          productName.includes(beneficialStr.toLowerCase()))) {
        score += 50;
        reasons.push(`Contains beneficial ${beneficialStr}`);
      }
    }

    // Match skin concerns
    for (const concern of criteria.primaryConcerns) {
      if (productBenefits.some(benefit => benefit.includes(concern)) ||
          productName.includes(concern) ||
          productCategory.includes(concern)) {
        score += 30;
        reasons.push(`Targets ${concern}`);
      }
    }

    // Match skin type
    if (criteria.skinType) {
      const skinTypeKeywords = getSkinTypeKeywords(criteria.skinType);
      for (const keyword of skinTypeKeywords) {
        if (productName.includes(keyword) || 
            productBenefits.some(b => b.includes(keyword))) {
          score += 20;
          reasons.push(`Suitable for ${criteria.skinType} skin`);
          break;
        }
      }
    }

    // Budget scoring
    const price = parseFloat(product.price_mrp) || 0;
    if (price > 0 && criteria.budgetRange) {
      const [min, max] = criteria.budgetRange;
      if (price >= min && price <= max) {
        score += 10;
        reasons.push('Within budget');
      }
    }

    // Base score for any valid skincare product
    if (score === 0 && productIngredients.length > 0) {
      score = 5;
      reasons.push('Valid skincare product');
    }

    // Bonus for popular/highly rated products
    if (product.rating_avg && product.rating_avg >= 4) {
      score += 15;
      reasons.push(`Highly rated (${product.rating_avg}★)`);
    }
    
    return { ...product, score, matchReasons: reasons };

  } catch (error) {
    console.error(`Error scoring product ${product.product_id}:`, error);
    return { ...product, score: 1, matchReasons: ['Processing error - included as fallback'] };
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
  
  if (typeof ingredients === 'object' && ingredients.ingredients_list) {
    return ingredients.ingredients_list
      .map(i => (i || '').toLowerCase())
      .filter(name => name.length > 0);
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
    'budget': [0, 50],
    'mid_range': [20, 100],
    'luxury': [50, 500],
    'mixed': [0, 500]
  };
  return budgetMap[budgetPreference] || [0, 500];
};

const getSkinTypeKeywords = (skinType) => {
  const keywordMap = {
    'Dry & Tight': ['dry', 'hydrating', 'moisturizing', 'nourishing', 'hydration'],
    'Oily & Shiny': ['oily', 'oil-control', 'mattifying', 'sebum', 'shine-control', 'oil-free'],
    'Combination': ['combination', 'balanced', 'normalize', 'T-zone'],
    'Normal & Balanced': ['normal', 'balanced', 'maintain', 'all skin types']
  };
  return keywordMap[skinType] || ['all skin types'];
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
  
  // Ensure we have at least some products in key categories
  const keyCategories = ['cleanser', 'serum', 'moisturizer'];
  keyCategories.forEach(cat => {
    if (!categories[cat] || categories[cat].length === 0) {
      // Find any product that could fit this category
      const fallback = products.find(p => {
        const name = (p.product_name || '').toLowerCase();
        return name.includes(cat) || (cat === 'moisturizer' && name.includes('cream'));
      });
      if (fallback) {
        categories[cat] = [fallback];
      }
    }
  });
  
  return categories;
};

const detectProductCategory = (product) => {
  const name = (product.product_name || '').toLowerCase();
  const category = (product.category_path || '').toLowerCase();
  
  // Check both name and category for better detection
  if (name.includes('cleanser') || category.includes('cleanser') || name.includes('wash')) return 'cleanser';
  if (name.includes('serum') || category.includes('serum')) return 'serum';
  if (name.includes('moisturizer') || name.includes('cream') || category.includes('moisturizer')) return 'moisturizer';
  if (name.includes('sunscreen') || name.includes('spf') || category.includes('sunscreen')) return 'sunscreen';
  if (name.includes('toner') || category.includes('toner')) return 'toner';
  if (name.includes('exfoliant') || name.includes('scrub') || name.includes('peel')) return 'exfoliant';
  if (name.includes('mask') || category.includes('mask')) return 'mask';
  if (name.includes('oil') && !name.includes('cleanser')) return 'oil';
  
  // More specific categorization
  if (name.includes('eye') || name.includes('dark circle')) return 'eye_care';
  if (name.includes('lip')) return 'lip_care';
  
  return 'treatment'; // Changed from 'other' to 'treatment' for better AI matching
};

const generateFilterSummary = (filteredProducts, criteria) => {
  return {
    totalProducts: filteredProducts.length,
    averageScore: filteredProducts.length > 0 
      ? filteredProducts.reduce((sum, p) => sum + p.score, 0) / filteredProducts.length 
      : 0,
    topReasons: getTopMatchReasons(filteredProducts),
    priceRange: {
      min: Math.min(...filteredProducts.map(p => parseFloat(p.price_mrp) || 0)),
      max: Math.max(...filteredProducts.map(p => parseFloat(p.price_mrp) || 0))
    },
    topBrands: getTopBrands(filteredProducts)
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

const getTopBrands = (products) => {
  const brandCounts = {};
  
  products.forEach(product => {
    if (product.brand_name) {
      brandCounts[product.brand_name] = (brandCounts[product.brand_name] || 0) + 1;
    }
  });
  
  return Object.entries(brandCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([brand, count]) => brand);
};

module.exports = {
  filterProductsForUser,
  extractFilterCriteria,
  scoreProduct
};