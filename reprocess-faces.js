require('dotenv').config();
const mongoose = require('mongoose');
const Photo = require('./src/models/Photo');
const Event = require('./src/models/Event');
const { loadModels, detectFacesFromUrl } = require('./src/services/faceService');

async function reprocessFaces() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Load face-api models first
    console.log('Loading face-api models...');
    await loadModels();
    console.log('Models loaded!\n');

    // Reset all photos to unprocessed
    const resetResult = await Photo.updateMany({}, {
      $set: { isProcessed: false, faces: [], facesCount: 0 }
    });
    console.log(`Reset ${resetResult.modifiedCount} photos to unprocessed\n`);

    // Reset event processedPhotos count
    await Event.updateMany({}, { $set: { processedPhotos: 0 } });

    // Get all photos
    const photos = await Photo.find({});
    console.log(`Processing ${photos.length} photos...\n`);

    let processed = 0;
    let totalFaces = 0;

    for (const photo of photos) {
      try {
        const faces = await detectFacesFromUrl(photo.imageUrl);

        photo.faces = faces;
        photo.facesCount = faces.length;
        photo.isProcessed = true;
        await photo.save();

        await Event.findByIdAndUpdate(photo.eventId, {
          $inc: { processedPhotos: 1 },
        });

        processed++;
        totalFaces += faces.length;
        console.log(`[${processed}/${photos.length}] Photo ${photo._id}: ${faces.length} faces found`);
      } catch (err) {
        console.error(`[${processed + 1}/${photos.length}] Photo ${photo._id} FAILED: ${err.message}`);
        photo.isProcessed = true;
        photo.facesCount = 0;
        await photo.save();
        processed++;
      }
    }

    console.log(`\nDone! Processed ${processed} photos, found ${totalFaces} total faces.`);
    process.exit(0);
  } catch (err) {
    console.error('Reprocess failed:', err.message);
    process.exit(1);
  }
}

reprocessFaces();
