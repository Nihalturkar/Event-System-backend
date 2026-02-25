const mongoose = require('mongoose');

const eventGuestSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  matchedPhotoIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Photo',
  }],
  matchedCount: {
    type: Number,
    default: 0,
  },
  downloadedPhotoIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Photo',
  }],
  lastScannedAt: Date,
  joinedAt: {
    type: Date,
    default: Date.now,
  },
});

eventGuestSchema.index({ eventId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('EventGuest', eventGuestSchema);
