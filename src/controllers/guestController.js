const Event = require('../models/Event');
const Photo = require('../models/Photo');
const EventGuest = require('../models/EventGuest');
const { matchFaces, extractSelfieDescriptor, calculateDistance } = require('../services/faceService');
const { success, error } = require('../utils/responseFormatter');
const { FACE_MATCH_THRESHOLD } = require('../config/constants');

const isDev = process.env.NODE_ENV === 'development';

const joinEvent = async (req, res) => {
  try {
    const { eventCode } = req.body;

    if (!eventCode) {
      return error(res, 'Event code is required.', 400);
    }

    // Uses compound index (eventCode, isActive)
    const event = await Event.findOne({ eventCode: eventCode.toUpperCase(), isActive: true }).lean();
    if (!event) return error(res, 'Event not found or inactive.', 404);

    // Check if already joined
    let eventGuest = await EventGuest.findOne({
      eventId: event._id,
      userId: req.userId,
    }).lean();

    if (!eventGuest) {
      eventGuest = await EventGuest.create({
        eventId: event._id,
        userId: req.userId,
      });
    }

    return success(res, {
      event: {
        _id: event._id,
        eventName: event.eventName,
        eventDate: event.eventDate,
        venue: event.venue,
        coverImage: event.coverImage,
        description: event.description,
        totalPhotos: event.totalPhotos,
        settings: event.settings,
      },
      joinedAt: eventGuest.joinedAt,
    }, 'Joined event successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

const matchFacesHandler = async (req, res) => {
  try {
    const { eventId, faceDescriptor } = req.body;

    if (!eventId || !faceDescriptor || faceDescriptor.length !== 128) {
      return error(res, 'Event ID and valid face descriptor are required.', 400);
    }

    // Use .lean() for faster reads - returns plain JS objects
    const photos = await Photo.find({
      eventId,
      isProcessed: true,
      facesCount: { $gt: 0 },
    }).select('faces thumbnailUrl imageUrl').lean();

    const matchedPhotos = [];

    for (const photo of photos) {
      const result = matchFaces(faceDescriptor, photo.faces, FACE_MATCH_THRESHOLD);
      if (result.matched) {
        matchedPhotos.push({
          _id: photo._id,
          thumbnailUrl: photo.thumbnailUrl,
          imageUrl: photo.imageUrl,
        });
      }
    }

    // Save matches
    await EventGuest.findOneAndUpdate(
      { eventId, userId: req.userId },
      {
        matchedPhotoIds: matchedPhotos.map(p => p._id),
        matchedCount: matchedPhotos.length,
        lastScannedAt: new Date(),
      },
      { upsert: true }
    );

    return success(res, {
      matchedCount: matchedPhotos.length,
      photos: matchedPhotos,
    }, 'Face matching complete');
  } catch (err) {
    return error(res, err.message);
  }
};

const getMyPhotos = async (req, res) => {
  try {
    const { eventId } = req.query;

    const eventGuest = await EventGuest.findOne({
      eventId,
      userId: req.userId,
    }).populate('matchedPhotoIds', 'imageUrl thumbnailUrl').lean();

    if (!eventGuest || !eventGuest.matchedPhotoIds.length) {
      return success(res, { photos: [], matchedCount: 0 }, 'No matched photos');
    }

    return success(res, {
      photos: eventGuest.matchedPhotoIds,
      matchedCount: eventGuest.matchedCount,
    }, 'Matched photos fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const downloadPhoto = async (req, res) => {
  try {
    const { photoId } = req.params;

    const photo = await Photo.findById(photoId).select('imageUrl eventId').lean();
    if (!photo) return error(res, 'Photo not found.', 404);

    // Track download - fire and forget, don't block response
    EventGuest.findOneAndUpdate(
      { eventId: photo.eventId, userId: req.userId },
      { $addToSet: { downloadedPhotoIds: photoId } }
    ).exec();

    return success(res, { imageUrl: photo.imageUrl }, 'Download URL fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const downloadAll = async (req, res) => {
  try {
    const { eventId } = req.body;

    const eventGuest = await EventGuest.findOne({
      eventId,
      userId: req.userId,
    }).populate('matchedPhotoIds', 'imageUrl').lean();

    if (!eventGuest) {
      return error(res, 'No matched photos found.', 404);
    }

    const urls = eventGuest.matchedPhotoIds.map(p => p.imageUrl);

    // Track all downloads - fire and forget
    EventGuest.findOneAndUpdate(
      { eventId, userId: req.userId },
      { downloadedPhotoIds: eventGuest.matchedPhotoIds.map(p => p._id) }
    ).exec();

    return success(res, { urls, count: urls.length }, 'Download URLs fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const getAllEventPhotos = async (req, res) => {
  try {
    const { eventId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!eventId) return error(res, 'Event ID is required.', 400);

    // Allow photographers (event owner) or guests who joined
    const event = await Event.findById(eventId).select('photographerId').lean();
    if (!event) return error(res, 'Event not found.', 404);

    const isOwner = event.photographerId.toString() === req.userId.toString();
    if (!isOwner) {
      const eventGuest = await EventGuest.findOne({ eventId, userId: req.userId }).lean();
      if (!eventGuest) return error(res, 'You have not joined this event.', 403);
    }

    // Run both queries in parallel
    const [photos, total] = await Promise.all([
      Photo.find({ eventId })
        .select('imageUrl thumbnailUrl createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Photo.countDocuments({ eventId }),
    ]);

    return success(res, {
      photos,
      total,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    }, 'All event photos fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const getJoinedEvents = async (req, res) => {
  try {
    const guestEntries = await EventGuest.find({ userId: req.userId })
      .sort({ joinedAt: -1 })
      .populate('eventId', 'eventName eventDate venue coverImage totalPhotos isActive')
      .lean();

    const events = guestEntries
      .filter((entry) => entry.eventId)
      .map((entry) => ({
        _id: entry.eventId._id,
        eventName: entry.eventId.eventName,
        eventDate: entry.eventId.eventDate,
        venue: entry.eventId.venue,
        coverImage: entry.eventId.coverImage,
        totalPhotos: entry.eventId.totalPhotos,
        isActive: entry.eventId.isActive,
        joinedAt: entry.joinedAt,
        matchedCount: entry.matchedCount,
      }));

    return success(res, { events }, 'Joined events fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

// Scan selfie - detect face and match against event photos
const scanFace = async (req, res) => {
  try {
    const { eventId } = req.body;

    if (!eventId) {
      return error(res, 'Event ID is required.', 400);
    }

    if (!req.file) {
      return error(res, 'Selfie image is required.', 400);
    }

    if (isDev) console.log(`[ScanFace] Starting for event ${eventId}, image size: ${req.file.size} bytes`);

    // Start face extraction and photo query in parallel
    const [faceResult, photos] = await Promise.allSettled([
      extractSelfieDescriptor(req.file.buffer),
      Photo.find({
        eventId,
        isProcessed: true,
        facesCount: { $gt: 0 },
      }).select('faces thumbnailUrl imageUrl').lean(),
    ]);

    if (faceResult.status === 'rejected') {
      if (isDev) console.error('[ScanFace] Face extraction failed:', faceResult.reason.message);
      return error(res, 'Could not detect a face in your selfie. Please ensure your face is clearly visible, well-lit, and facing the camera.', 400);
    }

    const faceDescriptor = faceResult.value.descriptor;
    const eventPhotos = photos.status === 'fulfilled' ? photos.value : [];

    if (isDev) console.log(`[ScanFace] Found ${eventPhotos.length} processed photos with faces`);

    if (eventPhotos.length === 0) {
      const unprocessedCount = await Photo.countDocuments({ eventId, isProcessed: false });
      if (unprocessedCount > 0) {
        return success(res, {
          matchedCount: 0,
          photos: [],
          faceDescriptor,
          message: `Photos are still being processed (${unprocessedCount} remaining). Please try again in a few minutes.`,
        }, 'Photos still processing');
      }
    }

    const matchedPhotos = [];

    for (const photo of eventPhotos) {
      const result = matchFaces(faceDescriptor, photo.faces, FACE_MATCH_THRESHOLD);
      if (result.matched) {
        matchedPhotos.push({
          _id: photo._id,
          thumbnailUrl: photo.thumbnailUrl,
          imageUrl: photo.imageUrl,
        });
      }
    }

    if (isDev) console.log(`[ScanFace] Matched ${matchedPhotos.length} out of ${eventPhotos.length} photos`);

    // Save matches
    await EventGuest.findOneAndUpdate(
      { eventId, userId: req.userId },
      {
        matchedPhotoIds: matchedPhotos.map(p => p._id),
        matchedCount: matchedPhotos.length,
        lastScannedAt: new Date(),
      },
      { upsert: true }
    );

    return success(res, {
      matchedCount: matchedPhotos.length,
      photos: matchedPhotos,
      faceDescriptor,
    }, 'Face scan complete');
  } catch (err) {
    if (isDev) console.error('[ScanFace] Error:', err.message);
    return error(res, err.message);
  }
};

module.exports = { joinEvent, matchFacesHandler, scanFace, getMyPhotos, getAllEventPhotos, downloadPhoto, downloadAll, getJoinedEvents };
