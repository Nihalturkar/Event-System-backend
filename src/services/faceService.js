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

// Detect faces from a Cloudinary URL
const detectFacesFromUrl = async (imageUrl) => {
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
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

// Compare face descriptors - optimized with typed arrays
const matchFaces = (guestDescriptor, photoFaces, threshold = FACE_MATCH_THRESHOLD) => {
  let bestDistance = Infinity;
  for (const face of photoFaces) {
    if (!face.descriptor || face.descriptor.length !== 128) continue;

    let sum = 0;
    for (let i = 0; i < 128; i++) {
      const diff = guestDescriptor[i] - face.descriptor[i];
      sum += diff * diff;
    }
    const distance = Math.sqrt(sum);

    if (distance < bestDistance) bestDistance = distance;

    if (distance < threshold) {
      return { matched: true, distance };
    }
  }
  return { matched: false, distance: bestDistance };
};

const calculateDistance = (descriptor1, descriptor2) => {
  if (!descriptor1 || !descriptor2 || descriptor1.length !== descriptor2.length) {
    return Infinity;
  }
  let sum = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    const diff = descriptor1[i] - descriptor2[i];
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
