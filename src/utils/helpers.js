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

const isMatch = (descriptor1, descriptor2, threshold = 0.5) => {
  return calculateDistance(descriptor1, descriptor2) < threshold;
};

const paginate = (page = 1, limit = 20) => {
  const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  return { skip, limit: parseInt(limit) };
};

module.exports = { calculateDistance, isMatch, paginate };
