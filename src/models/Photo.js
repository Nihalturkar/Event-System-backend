const mongoose = require('mongoose');

const faceSchema = new mongoose.Schema({
  faceId: String,
  descriptor: [Number],
  boundingBox: {
    x: Number,
    y: Number,
    width: Number,
    height: Number,
  },
}, { _id: false });

const photoSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
  },
  imageUrl: {
    type: String,
    required: true,
  },
  thumbnailUrl: {
    type: String,
    required: true,
  },
  publicId: {
    type: String,
    required: true,
  },
  width: Number,
  height: Number,
  size: Number,
  faces: [faceSchema],
  facesCount: {
    type: Number,
    default: 0,
  },
  isProcessed: {
    type: Boolean,
    default: false,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
});

photoSchema.index({ eventId: 1, isProcessed: 1, facesCount: 1 });
photoSchema.index({ eventId: 1, createdAt: -1 });
photoSchema.index({ publicId: 1 }); // fast delete by publicId
photoSchema.index({ eventId: 1, uploadedAt: -1 }); // pagination sorted by upload time

module.exports = mongoose.model('Photo', photoSchema);
