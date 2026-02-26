const Event = require('../models/Event');
const Photo = require('../models/Photo');
const EventGuest = require('../models/EventGuest');
const { matchFaces, extractSelfieDescriptor } = require('../services/faceService');
const { success, error } = require('../utils/responseFormatter');
const { FACE_MATCH_THRESHOLD } = require('../config/constants');

const joinEvent = async (req, res) => {
  try {
    const { eventCode } = req.body;

    if (!eventCode) {
      return error(res, 'Event code is required.', 400);
    }

    const event = await Event.findOne({ eventCode: eventCode.toUpperCase(), isActive: true });
    if (!event) return error(res, 'Event not found or inactive.', 404);

    // Check if already joined
    let eventGuest = await EventGuest.findOne({
      eventId: event._id,
      userId: req.userId,
    });

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

    // Get all processed photos for the event
    const photos = await Photo.find({
      eventId,
      isProcessed: true,
      facesCount: { $gt: 0 },
    });

    const matchedPhotos = [];

    for (const photo of photos) {
      if (matchFaces(faceDescriptor, photo.faces, FACE_MATCH_THRESHOLD)) {
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
    }).populate('matchedPhotoIds', 'imageUrl thumbnailUrl');

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

    const photo = await Photo.findById(photoId);
    if (!photo) return error(res, 'Photo not found.', 404);

    // Track download
    await EventGuest.findOneAndUpdate(
      { eventId: photo.eventId, userId: req.userId },
      { $addToSet: { downloadedPhotoIds: photoId } }
    );

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
    }).populate('matchedPhotoIds', 'imageUrl');

    if (!eventGuest) {
      return error(res, 'No matched photos found.', 404);
    }

    const urls = eventGuest.matchedPhotoIds.map(p => p.imageUrl);

    // Track all downloads
    await EventGuest.findOneAndUpdate(
      { eventId, userId: req.userId },
      { downloadedPhotoIds: eventGuest.matchedPhotoIds.map(p => p._id) }
    );

    return success(res, { urls, count: urls.length }, 'Download URLs fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const getAllEventPhotos = async (req, res) => {
  try {
    const { eventId } = req.query;

    if (!eventId) return error(res, 'Event ID is required.', 400);

    // Allow photographers (event owner) or guests who joined
    const event = await Event.findById(eventId);
    if (!event) return error(res, 'Event not found.', 404);

    const isOwner = event.photographerId.toString() === req.userId.toString();
    if (!isOwner) {
      const eventGuest = await EventGuest.findOne({ eventId, userId: req.userId });
      if (!eventGuest) return error(res, 'You have not joined this event.', 403);
    }

    const photos = await Photo.find({ eventId })
      .select('imageUrl thumbnailUrl createdAt')
      .sort({ createdAt: -1 });

    return success(res, {
      photos,
      total: photos.length,
    }, 'All event photos fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const getJoinedEvents = async (req, res) => {
  try {
    const guestEntries = await EventGuest.find({ userId: req.userId })
      .sort({ joinedAt: -1 })
      .populate('eventId', 'eventName eventDate venue coverImage totalPhotos isActive');

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

    // Extract face descriptor from uploaded selfie
    const faceData = await extractSelfieDescriptor(req.file.buffer);
    const faceDescriptor = faceData.descriptor;

    // Get all processed photos for the event
    const photos = await Photo.find({
      eventId,
      isProcessed: true,
      facesCount: { $gt: 0 },
    });

    const matchedPhotos = [];

    for (const photo of photos) {
      if (matchFaces(faceDescriptor, photo.faces, FACE_MATCH_THRESHOLD)) {
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
      faceDescriptor,
    }, 'Face scan complete');
  } catch (err) {
    return error(res, err.message);
  }
};

module.exports = { joinEvent, matchFacesHandler, scanFace, getMyPhotos, getAllEventPhotos, downloadPhoto, downloadAll, getJoinedEvents };
