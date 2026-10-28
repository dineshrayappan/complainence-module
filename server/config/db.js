const mongoose = require('mongoose');

// Disable bufferCommands to avoid hanging requests if MongoDB connection is pending/offline
mongoose.set('bufferCommands', false);

let isConnected = false;
let lastConnectionError = null;
let knownClusterDbs = new Set();
const companyDbCache = new Map();

const DEFAULT_MONGODB_URI =
  process.env.MONGODB_URI ||
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

    // Discover known databases in this MongoDB cluster
    try {
      const adminDb = mongoose.connection.db.admin();
      const dbsList = await adminDb.listDatabases();
      if (dbsList && Array.isArray(dbsList.databases)) {
        knownClusterDbs = new Set(dbsList.databases.map((d) => d.name));
        console.log(`[Database] Cluster databases discovered: [${Array.from(knownClusterDbs).join(', ')}]`);
      }
    } catch (dbListErr) {
      console.warn('[Database] Cluster database discovery notice:', dbListErr.message);
    }

    // Automatically ensure default admin user (admin / admin123) is present upon connection
    try {
      const { ensureDefaultAdminUser } = require('../utils/defaultAdmin');
      await ensureDefaultAdminUser();
    } catch (adminErr) {
      console.warn('⚠️ [Database] Default admin user initialization notice:', adminErr.message);
    }

    // Automatically ensure legacy unique index on email is dropped to permit duplicate email accounts
    try {
      const usersCol = mongoose.connection.db.collection('users');
      const userIndexes = await usersCol.indexes();
      const emailUniqueIdx = userIndexes.find(
        (idx) => idx.name === 'email_1' && idx.unique === true
      );
      if (emailUniqueIdx) {
        await usersCol.dropIndex('email_1');
        console.log('✅ [Database] Dropped legacy unique index on email_1 to support duplicate emails');
        await usersCol.createIndex({ email: 1 }, { background: true });
      }
    } catch (idxErr) {
      console.warn('⚠️ [Database] Email index migration notice:', idxErr.message);
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

/**
 * Returns a cached Mongoose Connection bound strictly to a company's database
 * @param {string} dbName - Target database name e.g. 'compliance_esstee'
 * @param {string} [fallbackDbName] - Fallback database name e.g. 'compliance_module'
 * @returns {mongoose.Connection}
 */
const getCompanyConnection = (dbName, fallbackDbName = null) => {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return null;
  }
  if (!dbName) {
    return mongoose.connection;
  }

  // If fallbackDbName is specified, and target db doesn't exist yet but fallback does, use fallback
  let effectiveDbName = dbName;
  if (
    fallbackDbName &&
    knownClusterDbs.size > 0 &&
    !knownClusterDbs.has(dbName) &&
    knownClusterDbs.has(fallbackDbName)
  ) {
    effectiveDbName = fallbackDbName;
  }

  if (companyDbCache.has(effectiveDbName)) {
    return companyDbCache.get(effectiveDbName);
  }

  const conn = mongoose.connection.useDb(effectiveDbName, { useCache: true });
  companyDbCache.set(effectiveDbName, conn);
  return conn;
};

const disconnectDB = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      isConnected = false;
      companyDbCache.clear();
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
  getCompanyConnection,
};
