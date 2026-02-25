const bcrypt = require('bcryptjs');
const axios = require('axios');
const OTP = require('../models/OTP');
const { generateOTP } = require('../utils/generateCode');
const { OTP_EXPIRY_MINUTES } = require('../config/constants');

const sendOTP = async (phone) => {
  // Invalidate previous OTPs
  await OTP.updateMany({ phone, isUsed: false }, { isUsed: true });

  const otp = generateOTP();
  const hashedOtp = await bcrypt.hash(otp, 10);

  await OTP.create({
    phone,
    otp: hashedOtp,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
  });

  // In development, log OTP and return in response; in production, send via SMS
  if (process.env.NODE_ENV === 'development') {
    console.log(`OTP for ${phone}: ${otp}`);
    return { expiresIn: OTP_EXPIRY_MINUTES * 60, devOtp: otp };
  }

  try {
    await axios.get('https://www.fast2sms.com/dev/bulkV2', {
      params: {
        authorization: process.env.SMS_API_KEY,
        variables_values: otp,
        route: 'otp',
        numbers: phone,
      },
    });
  } catch (err) {
    console.error('SMS send error:', err.message);
  }

  return { expiresIn: OTP_EXPIRY_MINUTES * 60 };
};

const verifyOTP = async (phone, otpInput) => {
  const otpRecord = await OTP.findOne({
    phone,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!otpRecord) {
    return false;
  }

  const isValid = await bcrypt.compare(otpInput, otpRecord.otp);

  if (isValid) {
    otpRecord.isUsed = true;
    await otpRecord.save();
  }

  return isValid;
};

module.exports = { sendOTP, verifyOTP };
