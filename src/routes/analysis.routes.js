const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysis.controller');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// POST /api/analysis/trigger
router.post('/trigger', analysisController.triggerAnalysis);

// GET /api/analysis/status/:analysisId
router.get('/status/:analysisId', analysisController.getAnalysisStatus);

// GET /api/analysis/:analysisId
router.get('/:analysisId', analysisController.getAnalysis);

module.exports = router; 