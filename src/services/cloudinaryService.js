const cloudinary = require('../config/cloudinary');
const { CLOUDINARY_FOLDERS } = require('../config/constants');

const uploadImage = async (fileBuffer, folder = CLOUDINARY_FOLDERS.PHOTOS) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

const uploadThumbnail = async (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_FOLDERS.THUMBNAILS,
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'fill', quality: 'auto' },
        ],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

const deleteImage = async (publicId) => {
  return cloudinary.uploader.destroy(publicId);
};

const getOptimizedUrl = (publicId, options = {}) => {
  return cloudinary.url(publicId, {
    secure: true,
    quality: 'auto',
    fetch_format: 'auto',
    ...options,
  });
};

module.exports = { uploadImage, uploadThumbnail, deleteImage, getOptimizedUrl };
