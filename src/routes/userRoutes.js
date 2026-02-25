const router = require('express').Router();
const { getProfile, updateProfile, saveFaceDescriptor, deleteAccount } = require('../controllers/userController');
const { auth } = require('../middlewares/auth');

router.get('/profile', auth, getProfile);
router.put('/profile', auth, updateProfile);
router.put('/face-descriptor', auth, saveFaceDescriptor);
router.delete('/account', auth, deleteAccount);

module.exports = router;
