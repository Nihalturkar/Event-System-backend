const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { error } = require('../utils/responseFormatter');

// In-memory user cache - avoids DB hit on every authenticated request
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedUser = (userId) => {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.user;
  }
  userCache.delete(userId);
  return null;
};

const setCachedUser = (userId, user) => {
  // Limit cache size to prevent memory leak
  if (userCache.size > 10000) {
    const firstKey = userCache.keys().next().value;
    userCache.delete(firstKey);
  }
  userCache.set(userId, { user, timestamp: Date.now() });
};

// Export for cache invalidation on profile update
const invalidateUserCache = (userId) => {
  userCache.delete(userId.toString());
};

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return error(res, 'Access denied. No token provided.', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    // Check cache first
    let user = getCachedUser(userId);
    if (!user) {
      user = await User.findById(userId).select('-faceDescriptor').lean();
      if (!user) {
        return error(res, 'User not found.', 401);
      }
      setCachedUser(userId, user);
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    return error(res, 'Invalid or expired token.', 401);
  }
};

const photographerOnly = (req, res, next) => {
  if (req.user.role !== 'photographer') {
    return error(res, 'Access denied. Photographer only.', 403);
  }
  next();
};

const guestOnly = (req, res, next) => {
  if (req.user.role !== 'guest') {
    return error(res, 'Access denied. Guest only.', 403);
  }
  next();
};

module.exports = { auth, photographerOnly, guestOnly, invalidateUserCache };
