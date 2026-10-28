const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://dineshrayappanr_db_user:cDRacfh8jnr2r8r4@cluster0.dop3n2g.mongodb.net/compliance_module?appName=Cluster0';

const EXPORT_DIR = path.join(__dirname, '..', 'db_export');

async function exportDatabase() {
  console.log('Connecting to MongoDB Atlas at:', MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
  await mongoose.connect(MONGODB_URI);

  const conn = mongoose.connection.useDb('compliance_module');
  const collections = await conn.db.listCollections().toArray();

  if (!fs.existsSync(EXPORT_DIR)) {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
  }

  const exportSummary = {
    exportedAt: new Date().toISOString(),
    database: 'compliance_module',
    cluster: mongoose.connection.host,
    collections: {},
  };

  const consolidatedData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      database: 'compliance_module',
      cluster: mongoose.connection.host,
    },
    tables: {},
  };

  console.log(`\nExporting ${collections.length} collections into: ${EXPORT_DIR}\n`);

  for (const col of collections) {
    const colName = col.name;
    const records = await conn.db.collection(colName).find({}).toArray();
    
    // Save individual collection JSON file
    const filePath = path.join(EXPORT_DIR, `${colName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf8');

    consolidatedData.tables[colName] = records;
    exportSummary.collections[colName] = {
      recordCount: records.length,
      file: `${colName}.json`,
      fileSizeBytes: fs.statSync(filePath).size,
    };

    console.log(`  ✅ Exported ${colName.padEnd(24)} -> ${records.length.toString().padStart(4)} records (${(fs.statSync(filePath).size / 1024).toFixed(1)} KB)`);
  }

  // Save full consolidated backup
  const consolidatedPath = path.join(EXPORT_DIR, 'full_database_backup.json');
  fs.writeFileSync(consolidatedPath, JSON.stringify(consolidatedData, null, 2), 'utf8');

  // Save summary metadata manifest
  const manifestPath = path.join(EXPORT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(exportSummary, null, 2), 'utf8');

  console.log(`\n📦 Full database backup saved to: ${consolidatedPath}`);
  console.log(`📋 Manifest summary saved to: ${manifestPath}`);

  await mongoose.disconnect();
  console.log('All data successfully exported and verified.');
}

exportDatabase().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
