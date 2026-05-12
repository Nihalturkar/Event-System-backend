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

// Indexes for fast lookups
userSchema.index({ phone: 1 }); // login/OTP verification
userSchema.index({ role: 1 }); // role-based queries

module.exports = mongoose.model('User', userSchema);
