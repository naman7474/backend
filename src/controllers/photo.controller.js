const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { analyzePhotoWithAI } = require('../services/ai-analysis.service');

// Upload photo
const uploadPhoto = async (req, res) => {
  try {
    const userId = req.user.id;
    const file = req.file;
    const photoType = req.body.photo_type || 'onboarding';

    if (!file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No photo provided'
        }
      });
    }

    // Generate unique IDs
    const sessionId = uuidv4();
    const photoId = uuidv4();
    const fileName = `${userId}/${photoId}.jpg`;

    console.log(`Starting photo upload for user ${userId}, session: ${sessionId}, photo: ${photoId}`);

    // Process image - resize and convert to JPEG
    let processedImage;
    try {
      processedImage = await sharp(file.buffer)
        .resize(800, 800, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 90 })
        .toBuffer();
      
      console.log(`Image processed successfully: ${processedImage.length} bytes`);
    } catch (sharpError) {
      console.error('Sharp processing error:', sharpError);
      
      // Handle HEIF/HEIC format error gracefully
      if (sharpError.message.includes('heif') || sharpError.message.includes('compression format')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_FORMAT',
            message: 'HEIF/HEIC format not supported. Please upload a JPEG or PNG image.'
          }
        });
      }
      
      // For other Sharp errors
      return res.status(400).json({
        success: false,
        error: {
          code: 'IMAGE_PROCESSING_ERROR',
          message: 'Failed to process image. Please try with a different image.'
        }
      });
    }

    // Upload to Supabase Storage
    const bucketName = process.env.SUPABASE_STORAGE_PHOTO_BUCKET || 'photo-uploads';
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, processedImage, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error('Failed to upload photo');
    }

    console.log(`Photo uploaded to storage successfully: ${fileName}`);

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    // Create photo record with session mapping
    const { data: photoRecord, error: dbError } = await supabase
      .from('photo_uploads')
      .insert({
        id: photoId,
        user_id: userId,
        session_id: sessionId, // Store session_id for mapping
        photo_url: publicUrl,
        photo_type: photoType,
        processing_status: 'queued' // Changed from 'pending' to 'queued'
      })
      .select()
      .single();

    if (dbError) {
      throw dbError;
    }

    console.log(`Photo record created, starting background processing...`);

    // Start processing in background (don't await)
    setImmediate(() => {
      processPhotoAsync(photoId, userId, processedImage);
    });

    res.status(200).json({
      success: true,
      data: {
        session_id: sessionId,
        photo_id: photoId,
        processing_status: 'queued',
        estimated_time: 30
      }
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to upload photo'
      }
    });
  }
};

// Process photo asynchronously
const processPhotoAsync = async (photoId, userId, imageBuffer) => {
  const startTime = Date.now();
  
  console.log(`[QUEUE] Starting photo processing for photo: ${photoId}`);

  try {
    // Update status to processing
    await supabase
      .from('photo_uploads')
      .update({ 
        processing_status: 'processing'
      })
      .eq('id', photoId);

    console.log(`[QUEUE] Photo status updated to 'processing'`);

    // Simulate some processing time (remove in production)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Convert image to base64 for AI analysis
    const base64Image = imageBuffer.toString('base64');
    
    console.log(`[QUEUE] Starting AI analysis...`);

    // Analyze with AI
    const aiAnalysis = await analyzePhotoWithAI(base64Image);
    
    console.log(`[QUEUE] AI analysis completed, saving results...`);

    // Create photo analysis record
    const { data: analysisRecord, error: analysisError } = await supabase
      .from('photo_analyses')
      .insert({
        user_id: userId,
        photo_id: photoId,
        status: 'completed',
        skin_tone: aiAnalysis.skinTone,
        face_shape: aiAnalysis.faceShape || 'oval',
        overall_skin_score: aiAnalysis.skinScore,
        skin_concerns: aiAnalysis.concerns,
        skin_attributes: {
          skinType: aiAnalysis.skinType,
          undertone: aiAnalysis.undertone,
          textureQuality: aiAnalysis.textureQuality,
          estimatedAge: aiAnalysis.estimatedAge
        },
        ai_observations: aiAnalysis.professionalObservations,
        improvement_areas: aiAnalysis.priorityTreatmentAreas,
        positive_attributes: aiAnalysis.positiveAttributes,
        confidence_score: 0.85,
        analysis_data: {
          problemAreas: aiAnalysis.problemAreas,
          fullAnalysis: aiAnalysis
        },
        completed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (analysisError) {
      throw analysisError;
    }

    // Update photo record with completion
    const processingTime = Date.now() - startTime;
    await supabase
      .from('photo_uploads')
      .update({ 
        processing_status: 'completed',
        processing_time_ms: processingTime,
        face_landmarks: aiAnalysis.problemAreas // Store as landmarks for now
      })
      .eq('id', photoId);

    console.log(`[QUEUE] Photo processing completed successfully in ${processingTime}ms`);

  } catch (error) {
    console.error('[QUEUE] Photo processing error:', error);
    
    // Update status to failed
    await supabase
      .from('photo_uploads')
      .update({ 
        processing_status: 'failed',
        processing_time_ms: Date.now() - startTime
      })
      .eq('id', photoId);

    // Create failed analysis record
    await supabase
      .from('photo_analyses')
      .insert({
        user_id: userId,
        photo_id: photoId,
        status: 'failed',
        completed_at: new Date().toISOString()
      });
    
    console.log(`[QUEUE] Photo processing failed for photo: ${photoId}`);
  }
};

// Get photo processing status
const getPhotoStatus = async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const userId = req.user.id;

    // Find photo by session_id
    const { data: photo, error: photoError } = await supabase
      .from('photo_uploads')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .single();

    if (photoError || !photo) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Photo session not found'
        }
      });
    }

    // Get analysis if completed
    let analysis = null;
    if (photo.processing_status === 'completed') {
      const { data: analysisData } = await supabase
        .from('photo_analyses')
        .select('*')
        .eq('photo_id', photo.id)
        .eq('status', 'completed')
        .single();
      
      analysis = analysisData;
    }

    // Calculate progress based on status
    let progress = 0;
    let currentStep = 'Waiting in queue';
    
    switch (photo.processing_status) {
      case 'queued':
        progress = 10;
        currentStep = 'Queued for processing';
        break;
      case 'processing':
        progress = 50;
        currentStep = 'Detecting facial landmarks';
        break;
      case 'completed':
        progress = 100;
        currentStep = 'Analysis complete';
        break;
      case 'failed':
        progress = 0;
        currentStep = 'Analysis failed';
        break;
    }

    const response = {
      success: true,
      data: {
        status: photo.processing_status,
        progress,
        current_step: currentStep,
        face_model_url: photo.face_model_url,
        face_landmarks: photo.face_landmarks
      }
    };

    if (analysis) {
      response.data.analysis = {
        skin_concerns: analysis.skin_concerns,
        skin_attributes: analysis.skin_attributes,
        overall_skin_score: analysis.overall_skin_score,
        ai_observations: analysis.ai_observations,
        positive_attributes: analysis.positive_attributes
      };
      response.data.processing_time = photo.processing_time_ms / 1000;
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Get photo status error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to get photo status'
      }
    });
  }
};

// Get photo details
const getPhoto = async (req, res) => {
  try {
    const photoId = req.params.photoId;
    const userId = req.user.id;

    const { data: photo, error } = await supabase
      .from('photo_uploads')
      .select('*')
      .eq('id', photoId)
      .eq('user_id', userId)
      .single();

    if (error || !photo) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Photo not found'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: photo
    });
  } catch (error) {
    console.error('Get photo error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to get photo'
      }
    });
  }
};

module.exports = {
  uploadPhoto,
  getPhotoStatus,
  getPhoto
}; 