const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendation.controller');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// GET /api/recommendations/beauty
router.get('/beauty', recommendationController.getRecommendations);

// GET /api/recommendations/beauty/:recommendationId
router.get('/beauty/:recommendationId', recommendationController.getRecommendationDetail);

// POST /api/recommendations/feedback/:recommendationId
router.post('/feedback/:recommendationId', recommendationController.submitFeedback);

// PUT /api/recommendations/rating/:recommendationId
router.put('/rating/:recommendationId', recommendationController.updateRating);

module.exports = router; 