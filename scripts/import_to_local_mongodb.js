const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const LOCAL_MONGODB_URI =
  process.env.LOCAL_MONGODB_URI ||
  process.env.MONGODB_URI_LOCAL ||
  'mongodb://127.0.0.1:27017/compliance_module';

const EXPORT_DIR = path.join(__dirname, '..', 'db_export');

// Recursive helper to revive ObjectId and Date types from exported JSON
function reviveValue(val, key) {
  if (val === null || val === undefined) return val;

  if (typeof val === 'string') {
    // Convert _id with 24-char hex string to ObjectId
    if (key === '_id' && /^[0-9a-fA-F]{24}$/.test(val)) {
      return new mongoose.Types.ObjectId(val);
    }
    // Convert ISO date strings to Date objects
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(val)) {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
    return val;
  }

  if (Array.isArray(val)) {
    return val.map((item) => reviveValue(item, key));
  }

  if (typeof val === 'object') {
    const revivedObj = {};
    for (const [k, v] of Object.entries(val)) {
      revivedObj[k] = reviveValue(v, k);
    }
    return revivedObj;
  }

  return val;
}

function reviveDocuments(docs) {
  return docs.map((doc) => reviveValue(doc, null));
}

async function importToLocal() {
  console.log(`Connecting to Local MongoDB at: ${LOCAL_MONGODB_URI}`);
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

      // Clean existing records in target local collection before import
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
  let totalDocs = 0;
  for (const c of cols) {
    const count = await conn.db.collection(c.name).countDocuments();
    totalDocs += count;
    console.log(`  📊 ${c.name.padEnd(25)} : ${count.toString().padStart(4)} records`);
  }

  console.log(`\n🎉 Total documents imported into local MongoDB: ${totalDocs}`);
  await mongoose.disconnect();
  console.log('All data successfully imported into Local MongoDB database: compliance_module');
}

importToLocal().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
