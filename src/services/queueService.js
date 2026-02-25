const Photo = require('../models/Photo');
const Event = require('../models/Event');

// Simple in-memory queue for processing (no Redis needed for free tier)
const processingQueue = new Map();

// Since face detection now happens on the client side,
// "processing" here just marks photos as ready for matching.
// When client-side face detection is integrated, descriptors
// will be sent via API and stored per photo.
const processEventPhotos = async (eventId) => {
  if (processingQueue.has(eventId.toString())) {
    return; // Already processing
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
        // Mark photo as processed (face descriptors will be
        // added when uploaded with client-side detection, or
        // via a separate face-indexing endpoint)
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
      } catch (err) {
        console.error(`Error processing photo ${photo._id}:`, err.message);
        photo.isProcessed = true;
        await photo.save();
        processed++;
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
