const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const influencerController = require('../controllers/influencer.controller');

// GET /api/influencers/recommended - Get recommended influencers
router.get('/recommended', 
  auth,
  influencerController.getRecommendedInfluencers
);

// GET /api/influencers/:id - Get influencer details
router.get('/:id', 
  auth,
  influencerController.getInfluencerDetails
);

// GET /api/influencers/:id/products - Get influencer's product recommendations
router.get('/:id/products', 
  auth,
  influencerController.getInfluencerProducts
);

module.exports = router; 