require('dotenv').config();
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const Photo = require('./src/models/Photo');
const Event = require('./src/models/Event');
const EventGuest = require('./src/models/EventGuest');

async function cleanup() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all photos with publicIds
    const photos = await Photo.find({}).select('publicId');
    console.log(`Found ${photos.length} photos to delete from Cloudinary`);

    // Delete from Cloudinary in batches of 10
    let deleted = 0;
    let failed = 0;
    for (let i = 0; i < photos.length; i += 10) {
      const batch = photos.slice(i, i + 10);
      const results = await Promise.allSettled(
        batch.map((p) => {
          if (p.publicId) {
            return cloudinary.uploader.destroy(p.publicId);
          }
          return Promise.resolve();
        })
      );
      results.forEach((r) => {
        if (r.status === 'fulfilled') deleted++;
        else failed++;
      });
      console.log(`  Cloudinary: ${deleted} deleted, ${failed} failed (${i + batch.length}/${photos.length})`);
    }

    // Also try to delete entire folders
    try {
      await cloudinary.api.delete_resources_by_prefix('photomatch/');
      console.log('Deleted photomatch/ folder resources');
    } catch (e) {
      console.log('No photomatch/ folder or already empty');
    }

    // Clear MongoDB collections
    const photoResult = await Photo.deleteMany({});
    console.log(`Deleted ${photoResult.deletedCount} photos from DB`);

    const eventResult = await Event.deleteMany({});
    console.log(`Deleted ${eventResult.deletedCount} events from DB`);

    const guestResult = await EventGuest.deleteMany({});
    console.log(`Deleted ${guestResult.deletedCount} guest records from DB`);

    console.log('\nCleanup complete!');
    process.exit(0);
  } catch (err) {
    console.error('Cleanup failed:', err.message);
    process.exit(1);
  }
}

cleanup();
