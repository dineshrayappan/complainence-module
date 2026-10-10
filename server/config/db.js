const mongoose = require('mongoose');

// Disable bufferCommands to avoid hanging requests if MongoDB connection is pending/offline
mongoose.set('bufferCommands', false);

let isConnected = false;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return true;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/garment_qms';

  try {
    console.log(`[Database] Attempting connection to MongoDB at: ${uri}`);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
      autoIndex: true,
    });
    isConnected = true;
    console.log('✅ [Database] Successfully connected to MongoDB server');

    // Automatically ensure default admin user (admin / admin123) is present upon connection
    try {
      const { ensureDefaultAdminUser } = require('../utils/defaultAdmin');
      await ensureDefaultAdminUser();
    } catch (adminErr) {
      console.warn('⚠️ [Database] Default admin user initialization notice:', adminErr.message);
    }

    return true;
  } catch (err) {
    isConnected = false;
    console.warn(`⚡ [Database] Could not connect to MongoDB (${err.message}). Operating in resilient fallback mode.`);
    return false;
  }
};

const isMongoConnected = () => {
  return mongoose.connection.readyState === 1;
};

const disconnectDB = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      isConnected = false;
      console.log('[Database] MongoDB connection cleanly closed.');
    }
  } catch (err) {
    console.error('[Database] Error disconnecting MongoDB:', err);
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  isMongoConnected,
};
