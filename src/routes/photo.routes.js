const express = require('express');
const router = express.Router();
const multer = require('multer');
const photoController = require('../controllers/photo.controller');
const authMiddleware = require('../middleware/auth');
const { validatePhotoUpload } = require('../middleware/validation');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (parseInt(process.env.MAX_PHOTO_SIZE_MB) || 10) * 1024 * 1024
  }
});

// All routes require authentication
router.use(authMiddleware);

// POST /api/photo/upload
router.post('/upload', upload.single('photo'), validatePhotoUpload, photoController.uploadPhoto);

// GET /api/photo/status/:sessionId
router.get('/status/:sessionId', photoController.getPhotoStatus);

// GET /api/photo/:photoId
router.get('/:photoId', photoController.getPhoto);

module.exports = router; 