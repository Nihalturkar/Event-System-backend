/**
 * Offline Face Match Test
 * Usage: node test-face-match.js <selfie-path>
 *
 * Scans all photos in A:\ShareMe, matches against the selfie,
 * and copies matched photos to A:\ShareMe\matched\
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { loadModels, detectFacesFromBuffer, extractSelfieDescriptor, matchFaces } = require('./src/services/faceService');

const PHOTOS_DIR = 'A:/ShareMe';
const OUTPUT_DIR = 'A:/ShareMe/matched';
const THRESHOLD = 0.4; // cosine distance threshold

async function main() {
  const selfiePath = process.argv[2];
  if (!selfiePath) {
    console.error('Usage: node test-face-match.js <selfie-path>');
    console.error('Example: node test-face-match.js A:/ShareMe/myselfie.jpg');
    process.exit(1);
  }

  if (!fs.existsSync(selfiePath)) {
    console.error('Selfie not found:', selfiePath);
    process.exit(1);
  }

  // Create output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Loading ArcFace + detector models...');
  await loadModels();
  console.log('Models loaded!\n');

  // Extract selfie face descriptor
  console.log('Processing selfie:', selfiePath);
  const selfieBuffer = fs.readFileSync(selfiePath);
  const selfieResult = await extractSelfieDescriptor(selfieBuffer);
  console.log('Selfie face extracted! Descriptor:', selfieResult.descriptor.length, 'D\n');

  // Get all image files
  const files = fs.readdirSync(PHOTOS_DIR).filter(f =>
    /\.(jpg|jpeg|png|heic)$/i.test(f) && f !== path.basename(selfiePath)
  );
  console.log(`Scanning ${files.length} photos...\n`);

  let matched = 0;
  let processed = 0;
  let noFace = 0;

  for (const file of files) {
    const filePath = path.join(PHOTOS_DIR, file);
    processed++;

    try {
      const buffer = fs.readFileSync(filePath);
      const faces = await detectFacesFromBuffer(buffer, { minConfidence: 0.3 });

      if (faces.length === 0) {
        noFace++;
        console.log(`[${processed}/${files.length}] ${file} - no faces`);
        continue;
      }

      const result = matchFaces(selfieResult.descriptor, faces, THRESHOLD);

      if (result.matched) {
        matched++;
        // Copy to matched folder
        fs.copyFileSync(filePath, path.join(OUTPUT_DIR, file));
        console.log(`[${processed}/${files.length}] ${file} - MATCHED! (distance: ${result.distance.toFixed(4)}, similarity: ${result.similarity.toFixed(4)}) [${faces.length} faces]`);
      } else {
        console.log(`[${processed}/${files.length}] ${file} - no match (distance: ${result.distance.toFixed(4)}, similarity: ${result.similarity.toFixed(4)}) [${faces.length} faces]`);
      }
    } catch (err) {
      console.log(`[${processed}/${files.length}] ${file} - ERROR: ${err.message}`);
    }
  }

  console.log('\n════════════════════════════════════════');
  console.log(`Total photos:   ${files.length}`);
  console.log(`Processed:      ${processed}`);
  console.log(`Faces found in: ${processed - noFace} photos`);
  console.log(`No face:        ${noFace} photos`);
  console.log(`MATCHED:        ${matched} photos`);
  console.log(`Output folder:  ${OUTPUT_DIR}`);
  console.log('════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
