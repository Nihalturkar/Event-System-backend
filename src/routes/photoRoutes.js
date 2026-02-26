const router = require('express').Router();
const {
  uploadPhotos, getPhotos, getPhoto, deletePhoto,
  updatePhotoFaces, triggerProcessing, getProcessingProgress,
  getUploadConfig, saveDirectPhotos,
} = require('../controllers/photoController');
const { auth, photographerOnly } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.get('/upload-config', auth, photographerOnly, getUploadConfig);
router.post('/:id/photos/direct', auth, photographerOnly, saveDirectPhotos);
router.post('/:id/photos', auth, photographerOnly, upload.array('photos', 50), uploadPhotos);
router.get('/:id/photos', auth, getPhotos);
// Static routes BEFORE dynamic :photoId route
router.post('/:id/photos/process', auth, photographerOnly, triggerProcessing);
router.get('/:id/photos/progress', auth, getProcessingProgress);
router.patch('/:id/photos/:photoId/faces', auth, photographerOnly, updatePhotoFaces);
router.get('/:id/photos/:photoId', auth, getPhoto);
router.delete('/:id/photos/:photoId', auth, photographerOnly, deletePhoto);

module.exports = router;
