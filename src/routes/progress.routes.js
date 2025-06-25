const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { body } = require('express-validator');
const progressController = require('../controllers/progress.controller');

// POST /api/progress/routine - Save routine completion
router.post('/routine', 
  auth,
  [
    body('date').isISO8601().withMessage('Valid date required'),
    body('routine_type').isIn(['morning', 'evening']).withMessage('Routine type must be morning or evening'),
    body('completed').isBoolean().withMessage('Completed must be boolean'),
    body('products_used').isArray().withMessage('Products used must be array'),
    body('notes').optional().isString().withMessage('Notes must be string')
  ],
  progressController.saveRoutineCompletion
);

// GET /api/progress/timeline - Get progress timeline
router.get('/timeline', 
  auth,
  progressController.getProgressTimeline
);

// POST /api/progress/feedback - Submit feedback
router.post('/feedback',
  auth,
  [
    body('days_used').isInt({ min: 1 }).withMessage('Days used must be positive integer'),
    body('overall_satisfaction').isString().withMessage('Overall satisfaction required'),
    body('skin_improvements').isArray().withMessage('Skin improvements must be array'),
    body('routine_adjustments_needed').isBoolean().withMessage('Routine adjustments needed must be boolean'),
    body('comments').optional().isString().withMessage('Comments must be string')
  ],
  progressController.submitFeedback
);

module.exports = router; 