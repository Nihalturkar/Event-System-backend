const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  name: {
    type: String,
    trim: true,
  },
  role: {
    type: String,
    enum: ['photographer', 'guest'],
    required: true,
  },
  profilePic: {
    type: String,
    default: '',
  },
  faceDescriptor: {
    type: [Number],
    default: [],
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

userSchema.index({ phone: 1 });

module.exports = mongoose.model('User', userSchema);
