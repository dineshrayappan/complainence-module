const mongoose = require('mongoose');

// Disable bufferCommands to avoid hanging requests if MongoDB connection is pending/offline
mongoose.set('bufferCommands', false);

let isConnected = false;
let lastConnectionError = null;

const DEFAULT_MONGODB_URI =
  'mongodb://127.0.0.1:27017/garment_qms';

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

    // Automatically convert any legacy disk or non-base64 complaint photos to Base64 data URLs in database
    try {
      const Complaint = require('../models/Complaint');
      const { toBase64DataUrl } = require('../utils/base64Helper');
      const legacyDocs = await Complaint.find({
        $or: [
          { beforePhoto: { $not: /^data:image\// } },
          { afterPhoto: { $exists: true, $ne: null, $not: /^data:image\// } },
        ],
      });
      if (legacyDocs && legacyDocs.length > 0) {
        console.log(`[Database] Migrating ${legacyDocs.length} legacy complaint photo(s) to Base64 encoding...`);
        for (const doc of legacyDocs) {
          if (doc.beforePhoto && !doc.beforePhoto.startsWith('data:image/')) {
            doc.beforePhoto = toBase64DataUrl(doc.beforePhoto);
          }
          if (doc.afterPhoto && !doc.afterPhoto.startsWith('data:image/')) {
            doc.afterPhoto = toBase64DataUrl(doc.afterPhoto);
          }
          await doc.save();
        }
        console.log('✅ [Database] All legacy complaint photos successfully migrated to Base64 encoding.');
      }
    } catch (migErr) {
      console.warn('⚠️ [Database] Photo migration notice:', migErr.message);
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
