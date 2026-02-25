require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/database');
const { loadModels } = require('./src/services/faceService');
          
const PORT = process.env.PORT || 5000;
 
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Pre-load face-api models
    try {
      await loadModels();
    } catch (err) {
      console.warn('Face models not loaded (download them to /models folder):', err.message);
    }

    app.listen(PORT, () => {
      console.log(`PhotoMatch API running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
