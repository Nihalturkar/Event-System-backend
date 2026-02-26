const router = require('express').Router();
const { joinEvent, matchFacesHandler, scanFace, getMyPhotos, getAllEventPhotos, downloadPhoto, downloadAll, getJoinedEvents } = require('../controllers/guestController');
const { auth, guestOnly } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.get('/my-events', auth, guestOnly, getJoinedEvents);
router.post('/join', auth, guestOnly, joinEvent);
router.post('/match-faces', auth, guestOnly, matchFacesHandler);
router.post('/scan-face', auth, guestOnly, upload.single('selfie'), scanFace);
router.get('/my-photos', auth, guestOnly, getMyPhotos);
router.get('/all-photos', auth, getAllEventPhotos);
router.post('/download/:photoId', auth, guestOnly, downloadPhoto);
router.post('/download-all', auth, guestOnly, downloadAll);

module.exports = router;
