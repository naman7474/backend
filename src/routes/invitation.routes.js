const express = require('express');
const router = express.Router();
const invitationController = require('../controllers/invitation.controller');
const { authenticate } = require('../middleware/auth');

// Public routes (no authentication required)
// GET /api/invitations/validate/:code - Validate invitation code
router.get('/validate/:code', invitationController.validateInvitation);

// Protected routes (authentication required)
// POST /api/invitations/create - Create new invitation
router.post('/create', authenticate, invitationController.createInvitation);

// GET /api/invitations/my-invitations - Get user's invitations
router.get('/my-invitations', authenticate, invitationController.getMyInvitations);

// GET /api/invitations/network - Get user's invitation network
router.get('/network', authenticate, invitationController.getInvitationNetwork);

// POST /api/invitations/track-share - Track share clicks
router.post('/track-share', authenticate, invitationController.trackShare);

// Admin routes (TODO: add admin middleware)
// GET /api/invitations/metrics - Get viral metrics
router.get('/metrics', authenticate, invitationController.getViralMetrics);

module.exports = router; 