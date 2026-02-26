const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  photographerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,    
  }, 
  eventName: {
    type: String,
    required: true,
    trim: true,
  },
  eventCode: {
    type: String,
    unique: true,
    uppercase: true,
    trim: true,
  },
  eventDate: {
    type: Date,
    required: true,
  },
  venue: {
    type: String,
    trim: true,
  },
  coverImage: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    trim: true,
  },
  totalPhotos: {
    type: Number,
    default: 0,
  },
  processedPhotos: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  settings: {
    allowDownload: { type: Boolean, default: true },
    allowShare: { type: Boolean, default: true },
    watermarkEnabled: { type: Boolean, default: false },
    watermarkText: { type: String, default: '' },
  },
}, {
  timestamps: true,
});

eventSchema.index({ photographerId: 1 });
eventSchema.index({ eventCode: 1 });

module.exports = mongoose.model('Event', eventSchema);
