const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/events', require('./photoRoutes'));
router.use('/events', require('./eventRoutes'));
router.use('/guest', require('./guestRoutes'));

module.exports = router;
