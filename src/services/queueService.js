const Photo = require('../models/Photo');
const Event = require('../models/Event');
const { detectFacesFromUrl } = require('./faceService');

// Simple in-memory queue for processing
const processingQueue = new Map();

const processEventPhotos = async (eventId) => {
  if (processingQueue.has(eventId.toString())) {
    return;
  }

  processingQueue.set(eventId.toString(), { status: 'processing', progress: 0 });

  try {
    const unprocessedPhotos = await Photo.find({
      eventId,
      isProcessed: false,
    });

    const total = unprocessedPhotos.length;
    let processed = 0;

    for (const photo of unprocessedPhotos) {
      try {
        // Detect faces from Cloudinary image URL
        const faces = await detectFacesFromUrl(photo.imageUrl);

        photo.faces = faces;
        photo.facesCount = faces.length;
        photo.isProcessed = true;
        await photo.save();

        processed++;

        await Event.findByIdAndUpdate(eventId, {
          $inc: { processedPhotos: 1 },
        });

        processingQueue.set(eventId.toString(), {
          status: 'processing',
          progress: Math.round((processed / total) * 100),
          processed,
          total,
        });

        console.log(`Processed photo ${processed}/${total} - ${faces.length} faces found`);
      } catch (err) {
        console.error(`Error processing photo ${photo._id}:`, err.message);
        // Mark as processed even on error to avoid infinite retry
        photo.isProcessed = true;
        photo.facesCount = 0;
        await photo.save();
        processed++;

        await Event.findByIdAndUpdate(eventId, {
          $inc: { processedPhotos: 1 },
        });

        processingQueue.set(eventId.toString(), {
          status: 'processing',
          progress: Math.round((processed / total) * 100),
          processed,
          total,
        });
      }
    }

    processingQueue.set(eventId.toString(), {
      status: 'completed',
      progress: 100,
      processed: total,
      total,
    });

    // Clean up after 5 minutes
    setTimeout(() => {
      processingQueue.delete(eventId.toString());
    }, 5 * 60 * 1000);
  } catch (err) {
    console.error('Processing queue error:', err.message);
    processingQueue.set(eventId.toString(), {
      status: 'failed',
      error: err.message,
    });
  }
};

const getProgress = (eventId) => {
  return processingQueue.get(eventId.toString()) || { status: 'idle', progress: 0 };
};

module.exports = { processEventPhotos, getProgress };
