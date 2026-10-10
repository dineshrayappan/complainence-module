const mongoose = require('mongoose');

// Disable bufferCommands to avoid hanging requests if MongoDB connection is pending/offline
mongoose.set('bufferCommands', false);

let isConnected = false;
let lastConnectionError = null;

const DEFAULT_MONGODB_URI =
  'mongodb+srv://dineshrayappanr_db_user:cDRacfh8jnr2r8r4@cluster0.dop3n2g.mongodb.net/compliance_module?appName=Cluster0';

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    lastConnectionError = null;
    return true;
  }

  // If already connecting (readyState === 2), wait for it to settle
  if (mongoose.connection.readyState === 2) {
    let waitLoops = 0;
    while (mongoose.connection.readyState === 2 && waitLoops < 25) {
      await new Promise((r) => setTimeout(r, 200));
      waitLoops++;
    }
    if (mongoose.connection.readyState === 1) {
      isConnected = true;
      lastConnectionError = null;
      return true;
    }
  }

  const uri = process.env.MONGODB_URI || DEFAULT_MONGODB_URI;

  try {
    const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
    console.log(`[Database] Attempting connection to MongoDB at: ${maskedUri}`);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      autoIndex: true,
    });
    isConnected = true;
    lastConnectionError = null;
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
    lastConnectionError = err.message;
    console.warn(`⚡ [Database] Could not connect to MongoDB (${err.message}). Operating in resilient fallback mode.`);
    return false;
  }
};

const isMongoConnected = () => {
  return mongoose.connection.readyState === 1;
};

const getLastConnectionError = () => lastConnectionError;

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
  getLastConnectionError,
};
