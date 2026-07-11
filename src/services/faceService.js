const path = require('path');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const { FACE_MATCH_THRESHOLD } = require('../config/constants');

const isDev = process.env.NODE_ENV === 'development';

const EMBEDDING_DIM = 512;
const PYTHON_SCRIPT = path.join(__dirname, 'face_processor.py');

// ─── Python InsightFace Bridge ───
// Uses InsightFace's buffalo_l model pack:
//   - det_10g.onnx (RetinaFace detector - much better than face-api SSD)
//   - w600k_r50.onnx (ArcFace recognition - 512D embeddings)
//   - Built-in face alignment (Umeyama similarity transform)
// This is the same tech stack PagarGuru uses (KBY-AI), but free & open-source.

const runPython = (args, timeoutMs = 120000) => {
  return new Promise((resolve, reject) => {
    execFile('python3', [PYTHON_SCRIPT, ...args], {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024, // 50MB for large descriptor arrays
    }, (err, stdout, stderr) => {
      if (err) {
        // Try 'python' if 'python3' not found
        if (err.code === 'ENOENT') {
          execFile('python', [PYTHON_SCRIPT, ...args], {
            timeout: timeoutMs,
            maxBuffer: 50 * 1024 * 1024,
          }, (err2, stdout2) => {
            if (err2) return reject(new Error('Python not found or script failed: ' + err2.message));
            try {
              resolve(JSON.parse(stdout2.trim()));
            } catch (e) {
              reject(new Error('Invalid Python output: ' + stdout2.slice(0, 200)));
            }
          });
          return;
        }
        return reject(new Error('Face processing failed: ' + (err.message || stderr)));
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        reject(new Error('Invalid Python output: ' + stdout.slice(0, 200)));
      }
    });
  });
};

// Write buffer to temp file, run python, clean up
const processBuffer = async (imageBuffer, command) => {
  const tmpFile = path.join(os.tmpdir(), `face_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
  try {
    fs.writeFileSync(tmpFile, imageBuffer);
    const result = await runPython([command, tmpFile]);
    if (result.error) {
      throw new Error(result.error);
    }
    return result;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
};

// ─── Model Loading ───
// InsightFace models are loaded lazily by Python on first call.
// This function warms up the Python process so first request isn't slow.
let modelsWarmed = false;

const loadModels = async () => {
  if (modelsWarmed) return;
  try {
    if (isDev) console.log('Warming up InsightFace Python engine...');
    await runPython(['warmup'], 180000); // 3 min timeout for first load
    modelsWarmed = true;
    if (isDev) console.log('InsightFace engine ready (512D embeddings)');
  } catch (err) {
    console.error('InsightFace warmup failed:', err.message);
    throw err;
  }
};

const preloadModels = async () => {
  try {
    await loadModels();
  } catch (err) {
    console.error('Failed to preload InsightFace:', err.message);
  }
};

// ─── Detect faces + extract embeddings from image buffer ───
const detectFacesFromBuffer = async (imageBuffer) => {
  const result = await processBuffer(imageBuffer, 'detect');
  // result is an array of {faceId, descriptor, boundingBox}
  return Array.isArray(result) ? result : [];
};

// ─── Detect faces from Cloudinary URL ───
const detectFacesFromUrl = async (imageUrl) => {
  const optimizedUrl = imageUrl.replace('/upload/', '/upload/w_1600,q_85/');
  const response = await axios.get(optimizedUrl, {
    responseType: 'arraybuffer',
    timeout: 30000,
  });
  const buffer = Buffer.from(response.data);
  return detectFacesFromBuffer(buffer);
};

// ─── Extract selfie descriptor ───
const extractSelfieDescriptor = async (imageBuffer) => {
  const result = await processBuffer(imageBuffer, 'selfie');
  if (result.error) {
    throw new Error(result.error);
  }
  return result;
};

// ─── Face Matching (Cosine Similarity) ───
// InsightFace embeddings are L2-normalized
// Cosine similarity = dot product
// Distance = 1 - similarity (0 = identical, 2 = opposite)
const matchFaces = (guestDescriptor, photoFaces, threshold = FACE_MATCH_THRESHOLD) => {
  const guest = guestDescriptor instanceof Float32Array
    ? guestDescriptor
    : new Float32Array(guestDescriptor);

  let bestDistance = Infinity;
  const dim = guest.length;

  for (const face of photoFaces) {
    if (!face.descriptor || face.descriptor.length !== dim) continue;

    const desc = face.descriptor instanceof Float32Array
      ? face.descriptor
      : new Float32Array(face.descriptor);

    // Cosine similarity (dot product of L2-normalized vectors)
    let similarity = 0;
    for (let i = 0; i < dim; i++) {
      similarity += guest[i] * desc[i];
    }

    const distance = 1 - similarity;

    if (distance < bestDistance) bestDistance = distance;

    if (distance < threshold) {
      return { matched: true, distance, similarity };
    }
  }

  return { matched: false, distance: bestDistance, similarity: 1 - bestDistance };
};

const calculateDistance = (descriptor1, descriptor2) => {
  if (!descriptor1 || !descriptor2 || descriptor1.length !== descriptor2.length) {
    return Infinity;
  }
  const d1 = descriptor1 instanceof Float32Array ? descriptor1 : new Float32Array(descriptor1);
  const d2 = descriptor2 instanceof Float32Array ? descriptor2 : new Float32Array(descriptor2);

  let similarity = 0;
  for (let i = 0; i < d1.length; i++) {
    similarity += d1[i] * d2[i];
  }
  return 1 - similarity;
};

module.exports = {
  loadModels,
  preloadModels,
  detectFacesFromBuffer,
  detectFacesFromUrl,
  extractSelfieDescriptor,
  matchFaces,
  calculateDistance,
  EMBEDDING_DIM,
};
