const jwt = require('jsonwebtoken');   
const User = require('../models/User');
const { sendOTP, verifyOTP } = require('../services/otpService');
const { success, error } = require('../utils/responseFormatter');

const sendOTPHandler = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || phone.length < 10) {
      return error(res, 'Valid phone number is required.', 400);
    }

    const result = await sendOTP(phone);
    const responseData = { expiresIn: result.expiresIn };
    if (result.devOtp) responseData.devOtp = result.devOtp;
    return success(res, responseData, 'OTP sent successfully');
  } catch (err) {
    return error(res, err.message);
  }
};

const verifyOTPHandler = async (req, res) => {
  try {
    const { phone, otp, role, name } = req.body;

    if (!phone || !otp) {
      return error(res, 'Phone and OTP are required.', 400);
    }

    const isValid = await verifyOTP(phone, otp);
    if (!isValid) {   
      return error(res, 'Invalid or expired OTP.', 400);
    }

    let user = await User.findOne({ phone });
    let isNewUser = false;

    if (!user) {
      if (!role) {
        return error(res, 'Role is required for new users.', 400);
      }
      user = await User.create({
        phone,
        name: name || '',
        role,
        isVerified: true,
      });
      isNewUser = true;
    } else {
      user.isVerified = true;
      if (name) user.name = name;
      await user.save();
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return success(res, {
      token,
      // user: {
      //   _id: user._id,
      //   phone: user.phone,
      //   name: user.name,
      //   role: user.role,
      //   profilePic: user.profilePic,
      // },
      user:user,
      isNewUser,
    }, 'Login successful');
  } catch (err) {
    return error(res, err.message);
  }
};

const refreshToken = async (req, res) => {
  try {
    const token = jwt.sign(
      { userId: req.user._id, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return success(res, { token }, 'Token refreshed');
  } catch (err) {
    return error(res, err.message);
  }
};

const logout = async (req, res) => {
  return success(res, null, 'Logged out successfully');
};

module.exports = { sendOTPHandler, verifyOTPHandler, refreshToken, logout };
