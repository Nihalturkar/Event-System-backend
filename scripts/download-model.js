/**
 * Download InsightFace w600k_r50 ONNX model if not present
 * Run: node scripts/download-model.js
 *
 * Model: InsightFace w600k_r50 (buffalo_l recognition model)
 * Size: ~167MB
 * Output: 512-dimensional face embeddings
 *
 * This model is downloaded via InsightFace's official release.
 * If auto-download fails, manually:
 *   1. pip install insightface
 *   2. python -c "import insightface; insightface.app.FaceAnalysis('buffalo_l')"
 *   3. Copy ~/.insightface/models/buffalo_l/w600k_r50.onnx to backend/models/mobilefacenet.onnx
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const MODEL_DIR = path.join(__dirname, '../models');
const MODEL_PATH = path.join(MODEL_DIR, 'mobilefacenet.onnx');
const MODEL_URL = 'https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip';

async function download() {
  if (fs.existsSync(MODEL_PATH)) {
    const stats = fs.statSync(MODEL_PATH);
    if (stats.size > 1000000) {
      console.log('ArcFace model already exists (' + Math.round(stats.size / 1024 / 1024) + 'MB)');
      return;
    }
  }

  fs.mkdirSync(MODEL_DIR, { recursive: true });
  console.log('Downloading ArcFace ONNX model (~63MB)...');

  return new Promise((resolve, reject) => {
    const follow = (url) => {
      https.get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error('Download failed with status ' + res.statusCode));
          return;
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const file = fs.createWriteStream(MODEL_PATH);

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (total > 0) {
            const pct = Math.round((downloaded / total) * 100);
            process.stdout.write('\r  ' + pct + '% (' + Math.round(downloaded / 1024 / 1024) + 'MB)');
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('\nModel downloaded successfully!');
          resolve();
        });
      }).on('error', reject);
    };

    follow(MODEL_URL);
  });
}

download().catch((err) => {
  console.error('Failed to download model:', err.message);
  process.exit(1);
});
