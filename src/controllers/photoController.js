const Photo = require('../models/Photo');
const Event = require('../models/Event');
const { uploadImage, uploadThumbnail, deleteImage } = require('../services/cloudinaryService');
const { processEventPhotos, getProgress } = require('../services/queueService');
const { success, error } = require('../utils/responseFormatter');

const uploadPhotos = async (req, res) => {
  try {
    const { id: eventId } = req.params;

    const event = await Event.findOne({ _id: eventId, photographerId: req.userId });
    if (!event) return error(res, 'Event not found.', 404);

    if (!req.files || req.files.length === 0) {
      return error(res, 'No photos uploaded.', 400);
    }

    const uploaded = [];
    const failed = [];

    // Upload all photos in parallel (batch of 5 at a time)
    const BATCH_SIZE = 5;
    for (let i = 0; i < req.files.length; i += BATCH_SIZE) {
      const batch = req.files.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const fullResult = await uploadImage(file.buffer);

          // Generate thumbnail URL using Cloudinary URL transformation (no separate upload needed)
          const thumbnailUrl = fullResult.secure_url.replace(
            '/upload/',
            '/upload/w_400,h_400,c_fill,q_auto/'
          );

          const photo = await Photo.create({
            eventId,
            imageUrl: fullResult.secure_url,
            thumbnailUrl,
            publicId: fullResult.public_id,
            width: fullResult.width,
            height: fullResult.height,
            size: file.size,
          });

          return {
            _id: photo._id,
            thumbnailUrl: photo.thumbnailUrl,
            isProcessed: false,
          };
        })
      );

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          uploaded.push(result.value);
        } else {
          failed.push({ filename: batch[idx].originalname, error: result.reason.message });
        }
      });
    }

    // Update total photos count
    await Event.findByIdAndUpdate(eventId, {
      $inc: { totalPhotos: uploaded.length },
    });

    return success(res, {
      uploaded: uploaded.length,
      failed: failed.length,
      photos: uploaded,
    }, 'Photos uploaded successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

const getPhotos = async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const photos = await Photo.find({ eventId })
      .select('-faces')
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Photo.countDocuments({ eventId });

    return success(res, {
      photos,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    }, 'Photos fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const getPhoto = async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.photoId).select('-faces');
    if (!photo) return error(res, 'Photo not found.', 404);
    return success(res, photo, 'Photo fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const deletePhoto = async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.photoId);
    if (!photo) return error(res, 'Photo not found.', 404);

    // Verify ownership through event
    const event = await Event.findOne({ _id: photo.eventId, photographerId: req.userId });
    if (!event) return error(res, 'Unauthorized.', 403);

    await deleteImage(photo.publicId);
    await Photo.findByIdAndDelete(photo._id);
    await Event.findByIdAndUpdate(photo.eventId, { $inc: { totalPhotos: -1 } });

    return success(res, null, 'Photo deleted');
  } catch (err) {
    return error(res, err.message);
  }
};

const updatePhotoFaces = async (req, res) => {
  try {
    const { photoId } = req.params;
    const { faces } = req.body;

    if (!faces || !Array.isArray(faces)) {
      return error(res, 'Faces array is required.', 400);
    }

    // Validate face descriptors
    const validFaces = faces.filter(face =>
      face.descriptor &&
      Array.isArray(face.descriptor) &&
      face.descriptor.length === 128
    );

    const photo = await Photo.findById(photoId);
    if (!photo) return error(res, 'Photo not found.', 404);

    // Verify ownership through event
    const event = await Event.findOne({ _id: photo.eventId, photographerId: req.userId });
    if (!event) return error(res, 'Unauthorized.', 403);

    // Update photo with face data
    photo.faces = validFaces;
    photo.facesCount = validFaces.length;
    photo.isProcessed = true;
    await photo.save();

    // Update event processed count
    await Event.findByIdAndUpdate(photo.eventId, {
      $inc: { processedPhotos: 1 },
    });

    return success(res, {
      photoId: photo._id,
      facesCount: validFaces.length,
    }, 'Face data updated');
  } catch (err) {
    return error(res, err.message);
  }
};

const triggerProcessing = async (req, res) => {
  try {
    const { id: eventId } = req.params;

    const event = await Event.findOne({ _id: eventId, photographerId: req.userId });
    if (!event) return error(res, 'Event not found.', 404);

    // Start processing in background
    processEventPhotos(eventId);

    return success(res, { message: 'Processing started' }, 'Face processing started');
  } catch (err) {
    return error(res, err.message);
  }
};

const getProcessingProgress = async (req, res) => {
  try {
    const progress = getProgress(req.params.id);
    return success(res, progress, 'Progress fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

module.exports = {
  uploadPhotos, getPhotos, getPhoto, deletePhoto,
  updatePhotoFaces, triggerProcessing, getProcessingProgress,
};
