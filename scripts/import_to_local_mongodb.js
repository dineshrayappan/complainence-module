const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const LOCAL_MONGODB_URI = 'mongodb://127.0.0.1:27017/compliance_module';
const EXPORT_DIR = path.join(__dirname, '..', 'db_export');

// Helper to revive ObjectId and Date types from exported JSON
function reviveDocuments(docs) {
  return docs.map((doc) => {
    const revived = { ...doc };

    for (const key of Object.keys(revived)) {
      const val = revived[key];

      // Convert 24-character hex strings in _id to ObjectId
      if (key === '_id' && typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val)) {
        revived._id = new mongoose.Types.ObjectId(val);
      }
      // Convert nested user / ref ObjectIds if applicable
      else if ((key === 'user' || key === 'assignedTo' || key === 'createdBy') && typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val)) {
        revived[key] = new mongoose.Types.ObjectId(val);
      }
      // Convert ISO Date strings to Date objects
      else if (
        typeof val === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)
      ) {
        revived[key] = new Date(val);
      }
    }

    return revived;
  });
}

async function importToLocal() {
  console.log(`Connecting to Local MongoDB Compass at: ${LOCAL_MONGODB_URI}`);
  await mongoose.connect(LOCAL_MONGODB_URI);
  const conn = mongoose.connection;

  const manifestPath = path.join(EXPORT_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Export directory or manifest not found at: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`Found ${Object.keys(manifest.collections).length} collections in export manifest.\n`);

  for (const [colName, meta] of Object.entries(manifest.collections)) {
    const filePath = path.join(EXPORT_DIR, meta.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`File missing for collection ${colName}: ${filePath}`);
      continue;
    }

    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const targetCollection = conn.db.collection(colName);

    if (Array.isArray(rawData) && rawData.length > 0) {
      const revivedData = reviveDocuments(rawData);

      // Clean existing records in target local collection before import to avoid duplicate key errors
      await targetCollection.deleteMany({});

      // Insert all records in batches
      await targetCollection.insertMany(revivedData, { ordered: false });
      const currentCount = await targetCollection.countDocuments();
      console.log(`  ✅ Imported ${colName.padEnd(25)} -> ${currentCount.toString().padStart(4)} records into local MongoDB`);
    } else {
      // Ensure empty collection exists in local database
      await conn.db.createCollection(colName).catch(() => {});
      console.log(`  ⚪ Initialized empty ${colName.padEnd(21)} ->    0 records`);
    }
  }

  console.log('\n=== VERIFYING LOCAL COMPASS DATABASE: compliance_module ===');
  const cols = await conn.db.listCollections().toArray();
  for (const c of cols) {
    const count = await conn.db.collection(c.name).countDocuments();
    if (count > 0) {
      console.log(`  📊 ${c.name.padEnd(25)} : ${count} records`);
    }
  }

  await mongoose.disconnect();
  console.log('\nAll data successfully imported into Local MongoDB Compass database: compliance_module');
}

importToLocal().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
