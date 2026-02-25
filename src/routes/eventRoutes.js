const router = require('express').Router();
const {
  createEvent, getEvents, getEventById, updateEvent,
  deleteEvent, getEventStats, getGuests, generateQRCode, generateQRCodeImage,
} = require('../controllers/eventController');
const { auth, photographerOnly } = require('../middlewares/auth');

router.post('/', auth, photographerOnly, createEvent);
router.get('/', auth, photographerOnly, getEvents);
router.get('/:id', auth, getEventById);
router.put('/:id', auth, photographerOnly, updateEvent);
router.delete('/:id', auth, photographerOnly, deleteEvent);
router.get('/:id/stats', auth, photographerOnly, getEventStats);
router.get('/:id/guests', auth, photographerOnly, getGuests);
router.get('/:id/qr-code', auth, photographerOnly, generateQRCode);
router.get('/:id/qr-image', generateQRCodeImage);

module.exports = router;
