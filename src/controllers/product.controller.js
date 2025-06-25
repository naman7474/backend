const supabase = require('../config/supabase');
const { validationResult } = require('express-validator');

const productController = {
  // Search products with filters
  async searchProducts(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: errors.array()
          }
        });
      }

      const { query, filters = {} } = req.body;
      const { 
        price_range, 
        concerns, 
        ingredients_include, 
        ingredients_exclude 
      } = filters;

      let supabaseQuery = supabase
        .from('products')
        .select('*');

      // Text search on product_name, brand_name, or description
      if (query) {
        supabaseQuery = supabaseQuery.or(`product_name.ilike.%${query}%,brand_name.ilike.%${query}%,description_html.ilike.%${query}%`);
      }

      // Price range filter
      if (price_range && price_range.length === 2) {
        supabaseQuery = supabaseQuery
          .gte('price_sale', price_range[0])
          .lte('price_sale', price_range[1]);
      }

      // Concerns filter (check if product benefits overlap with concerns)
      if (concerns && concerns.length > 0) {
        const concernsFilter = concerns.map(concern => `benefits_extracted.cs.{"${concern}"}`).join(',');
        supabaseQuery = supabaseQuery.or(concernsFilter);
      }

      // Ingredients include filter
      if (ingredients_include && ingredients_include.length > 0) {
        for (const ingredient of ingredients_include) {
          supabaseQuery = supabaseQuery.contains('ingredients_extracted', [ingredient]);
        }
      }

      // Ingredients exclude filter
      if (ingredients_exclude && ingredients_exclude.length > 0) {
        for (const ingredient of ingredients_exclude) {
          supabaseQuery = supabaseQuery.not('ingredients_extracted', 'cs', [ingredient]);
        }
      }

      const { data: products, error } = await supabaseQuery
        .order('rating_avg', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Search products error:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to search products'
          }
        });
      }

      res.json({
        success: true,
        data: {
          products,
          total_count: products.length,
          filters_applied: {
            query,
            price_range,
            concerns,
            ingredients_include,
            ingredients_exclude
          }
        }
      });

    } catch (error) {
      console.error('Search products error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error'
        }
      });
    }
  },

  // Get product details by ID
  async getProductDetails(req, res) {
    try {
      const { id } = req.params;

      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('Get product details error:', error);
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Product not found'
          }
        });
      }

      // Use existing rating data from product
      const averageRating = product.rating_avg || 0;

      res.json({
        success: true,
        data: {
          product: {
            ...product,
            average_rating: Number(averageRating.toFixed(1)),
            review_count: product.rating_count || 0
          }
        }
      });

    } catch (error) {
      console.error('Get product details error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error'
        }
      });
    }
  },

  // Get products by category
  async getProductsByCategory(req, res) {
    try {
      const { category } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .eq('category_path', category)
        .order('rating_avg', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Get products by category error:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to fetch products by category'
          }
        });
      }

      res.json({
        success: true,
        data: {
          products,
          category,
          total_count: products.length,
          pagination: {
            limit: parseInt(limit),
            offset: parseInt(offset),
            has_more: products.length === parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('Get products by category error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal server error'
        }
      });
    }
  }
};

module.exports = productController; 