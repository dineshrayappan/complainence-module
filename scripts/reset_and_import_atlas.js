const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ATLAS_MONGODB_URI =
  'mongodb+srv://dineshrayappanr_db_user:cDRacfh8jnr2r8r4@cluster0.dop3n2g.mongodb.net/compliance_module?appName=Cluster0';
const EXPORT_DIR = path.join(__dirname, '..', 'db_export');

function reviveDocuments(docs) {
  return docs.map((doc) => {
    const revived = { ...doc };

    for (const key of Object.keys(revived)) {
      const val = revived[key];

      if (key === '_id' && typeof val === 'string' && /^[0-9a-fA-F]{24}$/.test(val)) {
        revived._id = new mongoose.Types.ObjectId(val);
      } else if (
        (key === 'user' || key === 'assignedTo' || key === 'createdBy') &&
        typeof val === 'string' &&
        /^[0-9a-fA-F]{24}$/.test(val)
      ) {
        revived[key] = new mongoose.Types.ObjectId(val);
      } else if (
        typeof val === 'string' &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)
      ) {
        revived[key] = new Date(val);
      }
    }

    return revived;
  });
}

async function resetAndImportAtlas() {
  console.log(`Connecting to MongoDB Atlas at: ${ATLAS_MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  await mongoose.connect(ATLAS_MONGODB_URI);
  const conn = mongoose.connection.useDb('compliance_module');

  console.log('\n--- 1. DROPPING EXISTING COLLECTIONS ON ATLAS (compliance_module) ---');
  const existingCols = await conn.db.listCollections().toArray();
  for (const c of existingCols) {
    await conn.db.collection(c.name).drop().catch((e) => {
      console.warn(`Could not drop ${c.name}:`, e.message);
    });
    console.log(`  🗑️ Dropped collection: ${c.name}`);
  }

  console.log('\n--- 2. RECREATING COLLECTIONS AND IMPORTING DATA ---');
  const manifestPath = path.join(EXPORT_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Export manifest not found at: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

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
      await targetCollection.insertMany(revivedData, { ordered: false });
      const currentCount = await targetCollection.countDocuments();
      console.log(`  ✅ Recreated & Imported ${colName.padEnd(25)} -> ${currentCount.toString().padStart(4)} records`);
    } else {
      await conn.db.createCollection(colName).catch(() => {});
      console.log(`  ⚪ Initialized empty    ${colName.padEnd(25)} ->    0 records`);
    }
  }

  console.log('\n--- 3. VERIFYING ATLAS DATABASE (compliance_module) ---');
  const cols = await conn.db.listCollections().toArray();
  for (const c of cols) {
    const count = await conn.db.collection(c.name).countDocuments();
    if (count > 0) {
      console.log(`  📊 ${c.name.padEnd(25)} : ${count} records`);
    }
  }

  await mongoose.disconnect();
  console.log('\n🎉 Clean reset and re-import completed on MongoDB Atlas!');
}

resetAndImportAtlas().catch((err) => {
  console.error('Atlas reset & import failed:', err);
  process.exit(1);
});

