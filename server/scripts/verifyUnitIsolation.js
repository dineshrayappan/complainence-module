require('dotenv').config();
const mongoose = require('mongoose');
const {
  getComplaintModel,
  getUserModel,
  getAuditModel,
  getDepartmentModel,
  getTaskModel,
  getAuditLogModel,
  getAttendanceModel,
  getCanonicalUnitId,
  getCanonicalUnitName,
} = require('../models/unitModels');

async function verify() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in environment.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB Atlas successfully.');

  // 1. Verify Unit 1 Counts
  const u1NcCount = await getComplaintModel('UNIT-1').countDocuments();
  const u1UserCount = await getUserModel('UNIT-1').countDocuments();
  const u1AuditCount = await getAuditModel('UNIT-1').countDocuments();
  const u1DeptCount = await getDepartmentModel('UNIT-1').countDocuments();
  const u1TaskCount = await getTaskModel('UNIT-1').countDocuments();
  const u1LogCount = await getAuditLogModel('UNIT-1').countDocuments();
  const u1AttCount = await getAttendanceModel('UNIT-1').countDocuments();

  console.log('\n--- UNIT 1 COLLECTION AUDIT ---');
  console.log(`unit1_nc_records:    ${u1NcCount} (Expected: 15)`);
  console.log(`unit1_users:         ${u1UserCount} (Expected: 37)`);
  console.log(`unit1_audits:        ${u1AuditCount} (Expected: 8)`);
  console.log(`unit1_departments:   ${u1DeptCount} (Expected: 29)`);
  console.log(`unit1_tasks:         ${u1TaskCount} (Expected: 0)`);
  console.log(`unit1_auditlogs:     ${u1LogCount} (Expected: 215)`);
  console.log(`unit1_attendances:   ${u1AttCount} (Expected: 47)`);

  // 2. Verify Unit 2 Counts
  const u2NcCount = await getComplaintModel('UNIT-2').countDocuments();
  const u2UserCount = await getUserModel('UNIT-2').countDocuments();
  const u2AuditCount = await getAuditModel('UNIT-2').countDocuments();
  const u2DeptCount = await getDepartmentModel('UNIT-2').countDocuments();
  const u2TaskCount = await getTaskModel('UNIT-2').countDocuments();
  const u2LogCount = await getAuditLogModel('UNIT-2').countDocuments();
  const u2AttCount = await getAttendanceModel('UNIT-2').countDocuments();

  console.log('\n--- UNIT 2 COLLECTION AUDIT ---');
  console.log(`unit2_nc_records:    ${u2NcCount} (Expected: 0 clean start)`);
  console.log(`unit2_users:         ${u2UserCount} (Expected: 0 clean start)`);
  console.log(`unit2_audits:        ${u2AuditCount} (Expected: 0 clean start)`);
  console.log(`unit2_departments:   ${u2DeptCount} (Expected: 7 standard depts)`);
  console.log(`unit2_tasks:         ${u2TaskCount} (Expected: 0 clean start)`);
  console.log(`unit2_auditlogs:     ${u2LogCount} (Expected: 0 clean start)`);
  console.log(`unit2_attendances:   ${u2AttCount} (Expected: 0 clean start)`);

  // 3. Verify Admin User in Unit 1
  const adminU1 = await getUserModel('UNIT-1').findOne({ employeeId: 'ADM-001' }).select('name email role unitId');
  console.log('\n--- USER VERIFICATION ---');
  console.log(`Admin User in Unit 1:`, adminU1 ? `${adminU1.name} (${adminU1.employeeId} - ${adminU1.role}) unitId=${adminU1.unitId}` : 'NOT FOUND');

  const adminInU2 = await getUserModel('UNIT-2').findOne({ employeeId: 'ADM-001' });
  console.log(`Admin in Unit 2:`, adminInU2 ? 'FOUND (Should not be in U2)' : 'NULL (Correctly isolated to Unit 1)');

  // 4. Verify canonical unit resolution
  console.log('\n--- CANONICAL RESOLUTION ---');
  console.log('resolve "ALL":', getCanonicalUnitId('ALL'), '(Should be UNIT-1)');
  console.log('resolve "Unit 2":', getCanonicalUnitId('Unit 2'), '(Should be UNIT-2)');
  console.log('resolve undefined:', getCanonicalUnitId(undefined), '(Should be UNIT-1)');

  // 5. Verification checks
  const u1Ok = u1NcCount === 15 && u1UserCount === 37 && u1AuditCount === 8 && u1DeptCount === 29 && u1LogCount === 215;
  const u2Ok = u2NcCount === 0 && u2UserCount === 0 && u2AuditCount === 0 && u2DeptCount === 7 && u2LogCount === 0;

  if (u1Ok && u2Ok && adminU1 && !adminInU2) {
    console.log('\n🎉 ALL UNIT ISOLATION CHECKS PASSED PERFECTLY!');
  } else {
    console.warn('\n⚠️ Some checks did not match exact expectations.');
  }

  await mongoose.disconnect();
}

verify().catch((err) => {
  console.error('Verification script failed:', err);
  process.exit(1);
});
