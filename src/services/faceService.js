const path = require('path');

// Try native tfjs-node first (fast, works on Linux/Render), fallback to pure JS
let tf;
try {
  tf = require('@tensorflow/tfjs-node');
  console.log('Using @tensorflow/tfjs-node (native)');
} catch {
  tf = require('@tensorflow/tfjs');
  console.log('Using @tensorflow/tfjs (pure JS fallback)');
}

const faceapi = require('@vladmandic/face-api');
const sharp = require('sharp');
const axios = require('axios');
const { FACE_MATCH_THRESHOLD } = require('../config/constants');

let modelsLoaded = false;

// Load face-api models
const loadModels = async () => {
  if (modelsLoaded) return;

  // Use models bundled with @vladmandic/face-api package
  const modelsPath = path.join(__dirname, '../../node_modules/@vladmandic/face-api/model');
  console.log('Loading face-api models from:', modelsPath);

  await tf.ready();
  console.log('TensorFlow.js backend:', tf.getBackend());

  await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelsPath);
  await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
  await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);

  modelsLoaded = true;
  console.log('Face-api models loaded successfully');
};

// Convert image buffer to tensor for face-api
const imageToTensor = async (imageBuffer) => {
  const { data, info } = await sharp(imageBuffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const tensor = tf.tensor3d(
    new Uint8Array(data),
    [info.height, info.width, info.channels]
  );

  return tensor;
};

// Detect faces and extract descriptors from an image buffer
const detectFacesFromBuffer = async (imageBuffer) => {
  if (!modelsLoaded) {
    await loadModels();
  }

  const tensor = await imageToTensor(imageBuffer);

  try {
    const detections = await faceapi
      .detectAllFaces(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
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

// Detect faces from a URL (Cloudinary image)
const detectFacesFromUrl = async (imageUrl) => {
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);
  return detectFacesFromBuffer(buffer);
};

// Extract single face descriptor from selfie (for guest matching)
const extractSelfieDescriptor = async (imageBuffer) => {
  const faces = await detectFacesFromBuffer(imageBuffer);

  if (faces.length === 0) {
    throw new Error('No face detected. Please ensure your face is clearly visible.');
  }

  // Return the largest face (most prominent)
  if (faces.length > 1) {
    faces.sort((a, b) => {
      const areaA = a.boundingBox.width * a.boundingBox.height;
      const areaB = b.boundingBox.width * b.boundingBox.height;
      return areaB - areaA;
    });
  }

  return faces[0];
};

// Compare a guest's face descriptor against all faces in a photo
const matchFaces = (guestDescriptor, photoFaces, threshold = FACE_MATCH_THRESHOLD) => {
  for (const face of photoFaces) {
    if (!face.descriptor || face.descriptor.length !== 128) continue;

    let sum = 0;
    for (let i = 0; i < 128; i++) {
      sum += Math.pow(guestDescriptor[i] - face.descriptor[i], 2);
    }
    const distance = Math.sqrt(sum);

    if (distance < threshold) {
      return true;
    }
  }
  return false;
};

// Calculate Euclidean distance between two descriptors
const calculateDistance = (descriptor1, descriptor2) => {
  if (!descriptor1 || !descriptor2 || descriptor1.length !== descriptor2.length) {
    return Infinity;
  }
  let sum = 0;
  for (let i = 0; i < descriptor1.length; i++) {
    sum += Math.pow(descriptor1[i] - descriptor2[i], 2);
  }
  return Math.sqrt(sum);
};

module.exports = {
  loadModels,
  detectFacesFromBuffer,
  detectFacesFromUrl,
  extractSelfieDescriptor,
  matchFaces,
  calculateDistance,
};
