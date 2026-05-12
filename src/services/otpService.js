const bcrypt = require('bcryptjs');
const axios = require('axios');
const OTP = require('../models/OTP');
const { generateOTP } = require('../utils/generateCode');
const { OTP_EXPIRY_MINUTES } = require('../config/constants');

// Pre-generate salt for faster hashing (rounds=8 is secure enough for OTPs)
const BCRYPT_ROUNDS = 8;

const sendOTP = async (phone) => {
  // Invalidate only the latest unused OTP instead of scanning all
  await OTP.findOneAndUpdate(
    { phone, isUsed: false },
    { isUsed: true },
    { sort: { createdAt: -1 } }
  );

  const otp = generateOTP();
  const hashedOtp = await bcrypt.hash(otp, BCRYPT_ROUNDS);

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

  // Fire SMS without awaiting - don't block the response
  axios.get('https://www.fast2sms.com/dev/bulkV2', {
    params: {
      authorization: process.env.SMS_API_KEY,
      variables_values: otp,
      route: 'otp',
      numbers: phone,
    },
    timeout: 10000,
  }).catch(err => {
    console.error('SMS send error:', err.message);
  });

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
