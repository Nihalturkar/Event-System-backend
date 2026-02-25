const User = require('../models/User');
const { success, error } = require('../utils/responseFormatter');

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-faceDescriptor');
    if (!user) return error(res, 'User not found.', 404);
    return success(res, user, 'Profile fetched');
  } catch (err) {
    return error(res, err.message);
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, profilePic } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (profilePic) updates.profilePic = profilePic;

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true })
      .select('-faceDescriptor');

    return success(res, user, 'Profile updated');
  } catch (err) {
    return error(res, err.message);
  }
};

const saveFaceDescriptor = async (req, res) => {
  try {
    const { faceDescriptor } = req.body;

    if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
      return error(res, 'Valid face descriptor (128 numbers) is required.', 400);
    }

    await User.findByIdAndUpdate(req.userId, { faceDescriptor });
    return success(res, null, 'Face descriptor saved');
  } catch (err) {
    return error(res, err.message);
  }
};

const deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.userId);
    return success(res, null, 'Account deleted');
  } catch (err) {
    return error(res, err.message);
  }
};

module.exports = { getProfile, updateProfile, saveFaceDescriptor, deleteAccount };
