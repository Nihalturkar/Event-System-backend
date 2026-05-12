const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // Connection pool - allows multiple concurrent DB operations
      maxPoolSize: 20,
      minPoolSize: 5,
      // Faster timeout for initial connection
      serverSelectionTimeoutMS: 5000,
      // Socket timeout for operations
      socketTimeoutMS: 45000,
      // Buffering - fail fast instead of queuing indefinitely
      maxIdleTimeMS: 30000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
