const Photo = require('../models/Photo');
const Event = require('../models/Event');
const { detectFacesFromUrl } = require('./faceService');

const isDev = process.env.NODE_ENV === 'development';

// Simple in-memory queue for processing
const processingQueue = new Map();

// Process photos in parallel batches instead of one-by-one
const PARALLEL_BATCH_SIZE = 5;

const processEventPhotos = async (eventId) => {
  const key = eventId.toString();
  if (processingQueue.has(key)) {
    return;
  }

  processingQueue.set(key, { status: 'processing', progress: 0 });

  try {
    const unprocessedPhotos = await Photo.find({
      eventId,
      isProcessed: false,
    }).select('_id imageUrl').lean();

    const total = unprocessedPhotos.length;
    let processed = 0;

    // Process in parallel batches of PARALLEL_BATCH_SIZE
    for (let i = 0; i < total; i += PARALLEL_BATCH_SIZE) {
      const batch = unprocessedPhotos.slice(i, i + PARALLEL_BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(async (photo) => {
          try {
            const faces = await detectFacesFromUrl(photo.imageUrl);
            return { photoId: photo._id, faces, facesCount: faces.length, success: true };
          } catch (err) {
            if (isDev) console.error(`Error processing photo ${photo._id}:`, err.message);
            return { photoId: photo._id, faces: [], facesCount: 0, success: false };
          }
        })
      );

      // Batch update all photos in this group using bulkWrite
      const bulkOps = results.map((result) => {
        const data = result.status === 'fulfilled' ? result.value : { photoId: batch[0]._id, faces: [], facesCount: 0 };
        return {
          updateOne: {
            filter: { _id: data.photoId },
            update: {
              $set: {
                faces: data.faces,
                facesCount: data.facesCount,
                isProcessed: true,
              },
            },
          },
        };
      });

      if (bulkOps.length > 0) {
        await Photo.bulkWrite(bulkOps, { ordered: false });
      }

      processed += batch.length;

      // Single event update per batch instead of per photo
      await Event.findByIdAndUpdate(eventId, {
        $inc: { processedPhotos: batch.length },
      });

      processingQueue.set(key, {
        status: 'processing',
        progress: Math.round((processed / total) * 100),
        processed,
        total,
      });

      if (isDev) console.log(`Processed batch ${Math.ceil((i + 1) / PARALLEL_BATCH_SIZE)} - ${processed}/${total} photos done`);
    }

    processingQueue.set(key, {
      status: 'completed',
      progress: 100,
      processed: total,
      total,
    });

    // Clean up after 5 minutes
    setTimeout(() => {
      processingQueue.delete(key);
    }, 5 * 60 * 1000);
  } catch (err) {
    if (isDev) console.error('Processing queue error:', err.message);
    processingQueue.set(key, {
      status: 'failed',
      error: err.message,
    });
  }
};

const getProgress = (eventId) => {
  return processingQueue.get(eventId.toString()) || { status: 'idle', progress: 0 };
};

module.exports = { processEventPhotos, getProgress };
