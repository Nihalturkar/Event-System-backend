const path = require('path');

// Use WASM backend for better accuracy and speed (no native compilation needed)
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-wasm');

const faceapi = require('@vladmandic/face-api');
const sharp = require('sharp');
const axios = require('axios');
const { FACE_MATCH_THRESHOLD } = require('../config/constants');

const isDev = process.env.NODE_ENV === 'development';

let modelsLoaded = false;
let modelsLoading = null;

// Load face-api models
const loadModels = async () => {
  if (modelsLoaded) return;
  if (modelsLoading) return modelsLoading;

  modelsLoading = (async () => {
    try {
      // Set WASM backend for better accuracy than pure JS
      await tf.setBackend('wasm');
      await tf.ready();
      if (isDev) console.log('TensorFlow.js backend:', tf.getBackend());

      const modelsPath = path.join(__dirname, '../../node_modules/@vladmandic/face-api/model');

      await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
      await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
      await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);

      modelsLoaded = true;
      if (isDev) console.log('Face-api models loaded successfully');
    } catch (err) {
      // Fallback to CPU (pure JS) if WASM fails
      console.warn('WASM backend failed, falling back to CPU:', err.message);
      try {
        await tf.setBackend('cpu');
        await tf.ready();

        const modelsPath = path.join(__dirname, '../../node_modules/@vladmandic/face-api/model');
        await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);

        modelsLoaded = true;
        if (isDev) console.log('Face-api models loaded with CPU backend');
      } catch (fallbackErr) {
        modelsLoading = null;
        throw fallbackErr;
      }
    }
  })();

  return modelsLoading;
};

const preloadModels = async () => {
  try {
    if (isDev) console.log('Preloading face-api models...');
    await loadModels();
    if (isDev) console.log('Face-api models preloaded successfully');
  } catch (err) {
    console.error('Failed to preload face-api models:', err.message);
  }
};

// Convert image buffer to tensor - with EXIF rotation handling
const imageToTensor = async (imageBuffer, maxSize = 800) => {
  const { data, info } = await sharp(imageBuffer)
    .rotate() // Auto-rotate based on EXIF orientation
    .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const tensor = tf.tensor3d(
    new Uint8Array(data),
    [info.height, info.width, info.channels]
  );

  return tensor;
};

// Detect faces and extract descriptors
const detectFacesFromBuffer = async (imageBuffer, { minConfidence = 0.5, maxSize = 800 } = {}) => {
  if (!modelsLoaded) {
    await loadModels();
  }

  const tensor = await imageToTensor(imageBuffer, maxSize);

  try {
    const detections = await faceapi
      .detectAllFaces(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence }))
      .withFaceLandmarks()
      .withFaceDescriptors();

    return detections.map((d, i) => ({
      faceId: `face_${i}`,
      descriptor: Array.from(d.descriptor),
      boundingBox: {
        x: d.detection.box.x,
        y: d.detection.box.y,
        width: d.detection.box.width,
        height: d.detection.box.height,
      },
    }));
  } finally {
    tensor.dispose();
  }
};

// Detect faces from a Cloudinary URL - use reduced size for faster download
const detectFacesFromUrl = async (imageUrl) => {
  // Request a smaller version from Cloudinary to reduce download time
  const optimizedUrl = imageUrl.replace('/upload/', '/upload/w_1200,q_80/');
  const response = await axios.get(optimizedUrl, {
    responseType: 'arraybuffer',
    timeout: 30000,
  });
  const buffer = Buffer.from(response.data);
  return detectFacesFromBuffer(buffer);
};

// Extract face descriptor from selfie - uses SAME settings as photo processing
const extractSelfieDescriptor = async (imageBuffer) => {
  const faces = await detectFacesFromBuffer(imageBuffer, {
    minConfidence: 0.3,
    maxSize: 800,
  });

  if (faces.length === 0) {
    throw new Error('No face detected. Please ensure your face is clearly visible, well-lit, and facing the camera.');
  }

  if (faces.length > 1) {
    faces.sort((a, b) => {
      const areaA = a.boundingBox.width * a.boundingBox.height;
      const areaB = b.boundingBox.width * b.boundingBox.height;
      return areaB - areaA;
    });
  }

  return faces[0];
};

// Compare face descriptors - optimized with Float32Array for SIMD-like speed
const matchFaces = (guestDescriptor, photoFaces, threshold = FACE_MATCH_THRESHOLD) => {
  const thresholdSq = threshold * threshold; // Compare squared distances to avoid sqrt
  const guest = guestDescriptor instanceof Float32Array
    ? guestDescriptor
    : new Float32Array(guestDescriptor);
  let bestDistanceSq = Infinity;

  for (const face of photoFaces) {
    if (!face.descriptor || face.descriptor.length !== 128) continue;

    const desc = face.descriptor instanceof Float32Array
      ? face.descriptor
      : new Float32Array(face.descriptor);

    let sum = 0;
    for (let i = 0; i < 128; i++) {
      const diff = guest[i] - desc[i];
      sum += diff * diff;
      // Early exit: if partial sum already exceeds threshold, skip rest
      if (sum > thresholdSq) break;
    }

    if (sum < bestDistanceSq) bestDistanceSq = sum;

    if (sum < thresholdSq) {
      return { matched: true, distance: Math.sqrt(sum) };
    }
  }
  return { matched: false, distance: Math.sqrt(bestDistanceSq) };
};

const calculateDistance = (descriptor1, descriptor2) => {
  if (!descriptor1 || !descriptor2 || descriptor1.length !== descriptor2.length) {
    return Infinity;
  }
  const d1 = descriptor1 instanceof Float32Array ? descriptor1 : new Float32Array(descriptor1);
  const d2 = descriptor2 instanceof Float32Array ? descriptor2 : new Float32Array(descriptor2);
  let sum = 0;
  for (let i = 0; i < d1.length; i++) {
    const diff = d1[i] - d2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
};

module.exports = {
  loadModels,
  preloadModels,
  detectFacesFromBuffer,
  detectFacesFromUrl,
  extractSelfieDescriptor,
  matchFaces,
  calculateDistance,
};
