"""
Face detection + embedding extraction using InsightFace buffalo_l
Called by Node.js faceService.js via child_process.execFile

Usage:
  python face_processor.py warmup                  → loads models, prints {"ready": true}
  python face_processor.py detect <image_path>      → JSON array of faces with 512D descriptors
  python face_processor.py selfie <image_path>      → JSON of largest face descriptor

Models used (all free, open-source):
  - det_10g.onnx    : RetinaFace detector (better than SSD MobileNet)
  - w600k_r50.onnx  : ArcFace recognition (512D embeddings, trained on 600K identities)
  - Built-in Umeyama similarity transform for face alignment
"""
import sys
import json
import os
import warnings
import logging

# Suppress ALL warnings and logs before any imports
warnings.filterwarnings('ignore')
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['ONNXRUNTIME_LOG_LEVEL'] = '3'
logging.disable(logging.CRITICAL)

# Redirect stderr to suppress ONNX provider warnings during import
import io
_real_stderr = sys.stderr
sys.stderr = io.StringIO()

import cv2
import numpy as np

# Suppress insightface's print statements
_real_stdout = sys.stdout
sys.stdout = io.StringIO()
import insightface
sys.stdout = _real_stdout
sys.stderr = _real_stderr

_app = None

def get_app():
    global _app
    if _app is None:
        # Suppress all stdout/stderr during model loading
        _so, _se = sys.stdout, sys.stderr
        sys.stdout = io.StringIO()
        sys.stderr = io.StringIO()
        try:
            _app = insightface.app.FaceAnalysis(
                name='buffalo_l',
                root=os.path.expanduser('~/.insightface'),
                allowed_modules=['detection', 'recognition'],
            )
            _app.prepare(ctx_id=-1, det_size=(640, 640))
        finally:
            sys.stdout = _so
            sys.stderr = _se
    return _app


def detect_faces(image_path):
    app = get_app()
    img = cv2.imread(image_path)
    if img is None:
        return []

    faces = app.get(img)
    results = []
    for i, face in enumerate(faces):
        bbox = face.bbox.astype(float).tolist()
        results.append({
            'faceId': f'face_{i}',
            'descriptor': face.normed_embedding.tolist(),
            'boundingBox': {
                'x': bbox[0],
                'y': bbox[1],
                'width': bbox[2] - bbox[0],
                'height': bbox[3] - bbox[1],
            },
        })
    return results


def extract_selfie(image_path):
    faces = detect_faces(image_path)
    if not faces:
        return {'error': 'No face detected. Please ensure your face is clearly visible, well-lit, and facing the camera.'}

    # Pick largest face
    faces.sort(key=lambda f: f['boundingBox']['width'] * f['boundingBox']['height'], reverse=True)
    return faces[0]


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: face_processor.py <warmup|detect|selfie> [image_path]'}))
        sys.exit(1)

    command = sys.argv[1]

    try:
        if command == 'warmup':
            get_app()
            print(json.dumps({'ready': True}))

        elif command == 'detect':
            if len(sys.argv) < 3:
                print(json.dumps({'error': 'Image path required'}))
                sys.exit(1)
            result = detect_faces(sys.argv[2])
            print(json.dumps(result))

        elif command == 'selfie':
            if len(sys.argv) < 3:
                print(json.dumps({'error': 'Image path required'}))
                sys.exit(1)
            result = extract_selfie(sys.argv[2])
            print(json.dumps(result))

        else:
            print(json.dumps({'error': f'Unknown command: {command}'}))

    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)
