const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { body } = require('express-validator');
const productController = require('../controllers/product.controller');

// POST /api/products/search - Search products
router.post('/search', 
  auth,
  [
    body('query').optional().isString().withMessage('Query must be string'),
    body('filters').optional().isObject().withMessage('Filters must be object'),
    body('filters.price_range').optional().isArray().withMessage('Price range must be array'),
    body('filters.concerns').optional().isArray().withMessage('Concerns must be array'),
    body('filters.ingredients_include').optional().isArray().withMessage('Ingredients include must be array'),
    body('filters.ingredients_exclude').optional().isArray().withMessage('Ingredients exclude must be array')
  ],
  productController.searchProducts
);

// GET /api/products/:id - Get product details
router.get('/:id', 
  auth,
  productController.getProductDetails
);

// GET /api/products/category/:category - Get products by category
router.get('/category/:category', 
  auth,
  productController.getProductsByCategory
);

module.exports = router; 