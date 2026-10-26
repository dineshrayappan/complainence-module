require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing from environment');
    process.exit(1);
  }

  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  console.log('\n--- 1. PRE-MIGRATION COUNTS ---');
  const countsBefore = {
    complaints: await db.collection('complaints').countDocuments(),
    audits: await db.collection('audits').countDocuments(),
    attendances: await db.collection('attendances').countDocuments(),
    departments: await db.collection('departments').countDocuments(),
    auditlogs: await db.collection('auditlogs').countDocuments(),
    users: await db.collection('users').countDocuments(),
    compliancetasks: await db.collection('compliancetasks').countDocuments(),
  };
  console.log(JSON.stringify(countsBefore, null, 2));

  console.log('\n--- 2. MIGRATING UNIT 1 DATA ---');

  // A. Complaints -> unit1_nc_records
  const complaints = await db.collection('complaints').find({}).toArray();
  if (complaints.length > 0) {
    const unit1Complaints = complaints.map((c) => ({
      ...c,
      unitId: 'UNIT-1',
      unitName: 'Unit 1',
    }));
    for (const doc of unit1Complaints) {
      await db.collection('unit1_nc_records').replaceOne({ _id: doc._id }, doc, { upsert: true });
    }
    // Also update existing collection in place for safety
    await db.collection('complaints').updateMany(
      { $or: [{ unitId: null }, { unitId: '' }, { unitId: { $exists: false } }] },
      { $set: { unitId: 'UNIT-1', unitName: 'Unit 1' } }
    );
  }
  console.log(`Migrated ${complaints.length} complaints to unit1_nc_records.`);

  // B. Audits -> unit1_audits
  const audits = await db.collection('audits').find({}).toArray();
  if (audits.length > 0) {
    const unit1Audits = audits.map((a) => ({
      ...a,
      unitId: 'UNIT-1',
      unitName: 'Unit 1',
    }));
    for (const doc of unit1Audits) {
      await db.collection('unit1_audits').replaceOne({ _id: doc._id }, doc, { upsert: true });
    }
    await db.collection('audits').updateMany(
      { $or: [{ unitId: null }, { unitId: '' }, { unitId: { $exists: false } }] },
      { $set: { unitId: 'UNIT-1', unitName: 'Unit 1' } }
    );
  }
  console.log(`Migrated ${audits.length} audits to unit1_audits.`);

  // C. Attendances -> unit1_attendances
  const attendances = await db.collection('attendances').find({}).toArray();
  if (attendances.length > 0) {
    const unit1Attendances = attendances.map((att) => ({
      ...att,
      unitId: 'UNIT-1',
    }));
    for (const doc of unit1Attendances) {
      await db.collection('unit1_attendances').replaceOne({ _id: doc._id }, doc, { upsert: true });
    }
  }
  console.log(`Migrated ${attendances.length} attendances to unit1_attendances.`);

  // D. Departments -> unit1_departments
  const departments = await db.collection('departments').find({}).toArray();
  if (departments.length > 0) {
    const unit1Departments = departments.map((d) => ({
      ...d,
      unitId: 'UNIT-1',
    }));
    for (const doc of unit1Departments) {
      await db.collection('unit1_departments').replaceOne({ _id: doc._id }, doc, { upsert: true });
    }
  }
  console.log(`Migrated ${departments.length} departments to unit1_departments.`);

  // E. Audit Logs -> unit1_auditlogs
  const auditlogs = await db.collection('auditlogs').find({}).toArray();
  if (auditlogs.length > 0) {
    const unit1AuditLogs = auditlogs.map((log) => ({
      ...log,
      unitId: 'UNIT-1',
    }));
    for (const doc of unit1AuditLogs) {
      await db.collection('unit1_auditlogs').replaceOne({ _id: doc._id }, doc, { upsert: true });
    }
  }
  console.log(`Migrated ${auditlogs.length} audit logs to unit1_auditlogs.`);

  // F. Users -> unit1_users
  const users = await db.collection('users').find({}).toArray();
  if (users.length > 0) {
    const unit1Users = users.map((u) => ({
      ...u,
      unitId: 'UNIT-1',
      unitName: 'Unit 1',
      assignedUnits: ['UNIT-1'],
    }));
    for (const doc of unit1Users) {
      await db.collection('unit1_users').replaceOne({ _id: doc._id }, doc, { upsert: true });
    }
    await db.collection('users').updateMany(
      { $or: [{ unitId: null }, { unitId: '' }, { unitId: 'ALL' }, { unitId: { $exists: false } }] },
      { $set: { unitId: 'UNIT-1', unitName: 'Unit 1', assignedUnits: ['UNIT-1'] } }
    );
  }
  console.log(`Migrated ${users.length} users to unit1_users.`);

  // G. Compliance Tasks -> unit1_tasks
  const tasks = await db.collection('compliancetasks').find({}).toArray();
  if (tasks.length > 0) {
    const unit1Tasks = tasks.map((t) => ({
      ...t,
      unitId: 'UNIT-1',
      unitName: 'Unit 1',
    }));
    for (const doc of unit1Tasks) {
      await db.collection('unit1_tasks').replaceOne({ _id: doc._id }, doc, { upsert: true });
    }
  }
  console.log(`Migrated ${tasks.length} tasks to unit1_tasks.`);

  console.log('\n--- 3. INITIALIZING UNIT 2 COLLECTIONS (0 DUMMY DATA) ---');
  // Ensure Unit 2 collections exist by creating empty collections or indexes
  const u2Collections = [
    'unit2_nc_records',
    'unit2_tasks',
    'unit2_audits',
    'unit2_departments',
    'unit2_users',
    'unit2_auditlogs',
    'unit2_attendances',
  ];
  for (const collName of u2Collections) {
    const exists = await db.listCollections({ name: collName }).hasNext();
    if (!exists) {
      await db.createCollection(collName);
      console.log(`Created empty collection: ${collName}`);
    } else {
      console.log(`Collection already exists: ${collName}`);
    }
  }

  // Create standard department definitions for Unit 2 if none exist
  const u2DeptCount = await db.collection('unit2_departments').countDocuments();
  if (u2DeptCount === 0) {
    const standardDepts = [
      { name: 'Production', code: 'PRD', manager: 'Unassigned', headcount: 20, unitId: 'UNIT-2', createdAt: new Date() },
      { name: 'Quality', code: 'QA', manager: 'Unassigned', headcount: 10, unitId: 'UNIT-2', createdAt: new Date() },
      { name: 'Maintenance', code: 'MNT', manager: 'Unassigned', headcount: 8, unitId: 'UNIT-2', createdAt: new Date() },
      { name: 'Store', code: 'STR', manager: 'Unassigned', headcount: 6, unitId: 'UNIT-2', createdAt: new Date() },
      { name: 'EHS', code: 'EHS', manager: 'Unassigned', headcount: 4, unitId: 'UNIT-2', createdAt: new Date() },
      { name: 'EDP', code: 'EDP', manager: 'Unassigned', headcount: 3, unitId: 'UNIT-2', createdAt: new Date() },
      { name: 'HR', code: 'HR', manager: 'Unassigned', headcount: 5, unitId: 'UNIT-2', createdAt: new Date() },
    ];
    await db.collection('unit2_departments').insertMany(standardDepts);
    console.log('Initialized standard factory department list for Unit 2.');
  }

  console.log('\n--- 4. POST-MIGRATION COUNTS & VERIFICATION ---');
  const countsAfter = {
    'unit1_nc_records': await db.collection('unit1_nc_records').countDocuments(),
    'unit1_audits': await db.collection('unit1_audits').countDocuments(),
    'unit1_attendances': await db.collection('unit1_attendances').countDocuments(),
    'unit1_departments': await db.collection('unit1_departments').countDocuments(),
    'unit1_auditlogs': await db.collection('unit1_auditlogs').countDocuments(),
    'unit1_users': await db.collection('unit1_users').countDocuments(),
    'unit1_tasks': await db.collection('unit1_tasks').countDocuments(),
    '--- UNIT 2 ---': '---',
    'unit2_nc_records': await db.collection('unit2_nc_records').countDocuments(),
    'unit2_audits': await db.collection('unit2_audits').countDocuments(),
    'unit2_attendances': await db.collection('unit2_attendances').countDocuments(),
    'unit2_departments': await db.collection('unit2_departments').countDocuments(),
    'unit2_auditlogs': await db.collection('unit2_auditlogs').countDocuments(),
    'unit2_users': await db.collection('unit2_users').countDocuments(),
    'unit2_tasks': await db.collection('unit2_tasks').countDocuments(),
    '--- PRESERVED ORIGINAL COLLECTIONS ---': '---',
    'complaints (original)': await db.collection('complaints').countDocuments(),
    'users (original)': await db.collection('users').countDocuments(),
    'audits (original)': await db.collection('audits').countDocuments(),
  };
  console.log(JSON.stringify(countsAfter, null, 2));

  await mongoose.disconnect();
  console.log('\nMigration completed successfully!');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
