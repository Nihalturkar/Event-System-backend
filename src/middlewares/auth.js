const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { error } = require('../utils/responseFormatter');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return error(res, 'Access denied. No token provided.', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-faceDescriptor');

    if (!user) {
      return error(res, 'User not found.', 401);
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

module.exports = { auth, photographerOnly, guestOnly };
