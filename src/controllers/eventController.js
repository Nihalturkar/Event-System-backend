const Event = require('../models/Event');
const Photo = require('../models/Photo');
const EventGuest = require('../models/EventGuest');
const { generateEventCode } = require('../utils/generateCode');
const { success, error } = require('../utils/responseFormatter');
const QRCode = require('qrcode');
const { deleteImage } = require('../services/cloudinaryService');

const createEvent = async (req, res) => {
  try {
    const { eventName, eventDate, venue, description } = req.body;

    if (!eventName || !eventDate) {
      return error(res, 'Event name and date are required.', 400);
    }

    // Generate unique event code
    let eventCode = generateEventCode(eventName);
    let exists = await Event.findOne({ eventCode });
    let attempts = 0;
    while (exists && attempts < 10) {
      const suffix = Math.random().toString(36).substring(2, 4).toUpperCase();
      eventCode = eventCode.substring(0, 6) + suffix;
      exists = await Event.findOne({ eventCode });
      attempts++;
    }

    const event = await Event.create({
      photographerId: req.userId,
      eventName,
      eventCode,
      eventDate,
      venue,
      description,
    });

    return success(res, {
      _id: event._id,
      eventName: event.eventName,
      eventCode: event.eventCode,
      eventDate: event.eventDate,
      venue: event.venue,
      totalPhotos: 0,
    }, 'Event created successfully', 201);
  } catch (err) {
    return error(res, err.message);
  }
};

const getEvents = async (req, res) => {
  try {
    const events = await Event.find({ photographerId: req.userId })
      .sort({ createdAt: -1 });
    return success(res, events, 'Events fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return error(res, 'Event not found.', 404);
    return success(res, event, 'Event fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const updateEvent = async (req, res) => {
  try {
    const { eventName, eventDate, venue, description, coverImage, settings } = req.body;
    const updates = {};
    if (eventName) updates.eventName = eventName;
    if (eventDate) updates.eventDate = eventDate;
    if (venue) updates.venue = venue;
    if (description) updates.description = description;
    if (coverImage) updates.coverImage = coverImage;
    if (settings) updates.settings = settings;

    const event = await Event.findOneAndUpdate(
      { _id: req.params.id, photographerId: req.userId },
      updates,
      { new: true }
    );

    if (!event) return error(res, 'Event not found.', 404);
    return success(res, event, 'Event updated');
  } catch (err) {
    return error(res, err.message);
  }
};

const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findOne({
      _id: req.params.id,
      photographerId: req.userId,
    });
    if (!event) return error(res, 'Event not found.', 404);

    // Get all photos for this event
    const photos = await Photo.find({ eventId: req.params.id });

    // Delete all images from Cloudinary
    const deletePromises = photos.map(photo =>
      deleteImage(photo.publicId).catch(err => {
        console.error(`Failed to delete image ${photo.publicId}:`, err);
        return null; // Continue even if some deletions fail
      })
    );
    await Promise.all(deletePromises);

    // Clean up database records
    await Event.findByIdAndDelete(req.params.id);
    await Photo.deleteMany({ eventId: req.params.id });
    await EventGuest.deleteMany({ eventId: req.params.id });

    return success(res, null, 'Event and all associated images deleted successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

const getEventStats = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return error(res, 'Event not found.', 404);

    const guestCount = await EventGuest.countDocuments({ eventId: req.params.id });
    const photoCount = await Photo.countDocuments({ eventId: req.params.id });
    const processedCount = await Photo.countDocuments({ eventId: req.params.id, isProcessed: true });
    const totalFaces = await Photo.aggregate([
      { $match: { eventId: event._id } },
      { $group: { _id: null, total: { $sum: '$facesCount' } } },
    ]);

    return success(res, {
      totalPhotos: photoCount,
      processedPhotos: processedCount,
      totalGuests: guestCount,
      totalFaces: totalFaces[0]?.total || 0,
      eventName: event.eventName,
      eventCode: event.eventCode,
    }, 'Stats fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const getGuests = async (req, res) => {
  try {
    const guests = await EventGuest.find({ eventId: req.params.id })
      .populate('userId', 'name phone profilePic')
      .sort({ joinedAt: -1 });
    return success(res, guests, 'Guests fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const generateQRCode = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return error(res, 'Event not found.', 404);

    const qrData = JSON.stringify({
      eventCode: event.eventCode,
      eventName: event.eventName,
    });

    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 400,
      margin: 2,
      color: { dark: '#6C63FF', light: '#FFFFFF' },
    });

    return success(res, { qrCode: qrCodeDataUrl, eventCode: event.eventCode }, 'QR code generated');
  } catch (err) {
    return error(res, err.message);
  }
};

// Serve QR code as a PNG image (no auth needed - for browser/sharing)
const generateQRCodeImage = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).send('Event not found');

    const qrData = JSON.stringify({
      eventCode: event.eventCode,
      eventName: event.eventName,
    });

    const qrBuffer = await QRCode.toBuffer(qrData, {
      width: 400,
      margin: 2,
      color: { dark: '#6C63FF', light: '#FFFFFF' },
    });

    res.set('Content-Type', 'image/png');
    res.send(qrBuffer);
  } catch (err) {
    res.status(500).send('Error generating QR code');
  }
};

module.exports = {
  createEvent, getEvents, getEventById, updateEvent,
  deleteEvent, getEventStats, getGuests, generateQRCode, generateQRCodeImage,
};
