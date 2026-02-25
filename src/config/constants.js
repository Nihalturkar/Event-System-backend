module.exports = {
  OTP_EXPIRY_MINUTES: 5,
  OTP_LENGTH: 6,
  EVENT_CODE_LENGTH: 8,
  FACE_MATCH_THRESHOLD: parseFloat(process.env.FACE_MATCH_THRESHOLD) || 0.5,
  MAX_UPLOAD_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/heic'],
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  RATE_LIMIT: {
    windowMs: 60 * 1000, // 1 minute
    max: 100,
  },
  CLOUDINARY_FOLDERS: {
    PHOTOS: 'photomatch/photos',
    THUMBNAILS: 'photomatch/thumbnails',
    PROFILES: 'photomatch/profiles',
    COVERS: 'photomatch/covers',
  },
  ROLES: {
    PHOTOGRAPHER: 'photographer',
    GUEST: 'guest',
  },
};
