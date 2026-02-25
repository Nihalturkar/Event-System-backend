const router = require('express').Router();
const { sendOTPHandler, verifyOTPHandler, refreshToken, logout } = require('../controllers/authController');
const { auth } = require('../middlewares/auth');

router.post('/send-otp', sendOTPHandler);
router.post('/verify-otp', verifyOTPHandler);
router.post('/refresh-token', auth, refreshToken);
router.post('/logout', auth, logout);

module.exports = router;  
   