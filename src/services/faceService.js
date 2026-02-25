const { FACE_MATCH_THRESHOLD } = require('../config/constants');

// Face detection models are heavy and require native deps (canvas, tfjs-node).
// Strategy: face descriptor extraction happens on the CLIENT (React Native)
// using expo + tfjs-react-native. The backend only stores and COMPARES descriptors.

let modelsLoaded = false;

const loadModels = async () => {
  // No server-side models needed - descriptors come from the client
  modelsLoaded = true;
  console.log('Face service ready (descriptor matching mode)');
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

module.exports = { loadModels, matchFaces, calculateDistance };
