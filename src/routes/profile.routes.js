const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const authMiddleware = require('../middleware/auth');
const { validateProfileUpdate } = require('../middleware/validation');

// All routes require authentication
router.use(authMiddleware);

// GET /api/profile/beauty/onboarding
router.get('/beauty/onboarding', profileController.getOnboardingProgress);

// PUT /api/profile/beauty/skin
router.put('/beauty/:profileType', validateProfileUpdate, profileController.updateProfile);

// GET /api/profile/beauty
router.get('/beauty', profileController.getCompleteProfile);

// GET /api/profile/beauty/:profileType
router.get('/beauty/:profileType', profileController.getProfileSection);

module.exports = router; 