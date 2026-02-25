const { EVENT_CODE_LENGTH } = require('../config/constants');

const generateEventCode = (eventName) => {
  const prefix = eventName
    .replace(/[^a-zA-Z]/g, '')
    .substring(0, 4)
    .toUpperCase();

  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substring(2, 4).toUpperCase();

  let code = `${prefix}${year}`.substring(0, EVENT_CODE_LENGTH);

  if (code.length < EVENT_CODE_LENGTH) {
    code += random.substring(0, EVENT_CODE_LENGTH - code.length);
  }

  return code.substring(0, EVENT_CODE_LENGTH);
};

const generateOTP = (length = 6) => {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += Math.floor(Math.random() * 10);
  }
  return otp;
};

module.exports = { generateEventCode, generateOTP };
