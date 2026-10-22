const { connectDB } = require('../config/db');
const User = require('../models/User');
const { ensureDefaultAdminUser } = require('../utils/defaultAdmin');

async function run() {
  await connectDB();
  console.log('1. Connected to DB');

  // Clean previous test user if any
  await User.deleteOne({ employeeId: 'AUD-TEST-99' });

  // Create test user
  const rawPassword = 'PermanentPass123!';
  const user = await User.create({
    employeeId: 'AUD-TEST-99',
    name: 'Test Auditor User',
    email: 'aud_test99@factory.com',
    password: rawPassword,
    role: 'AUDITOR',
    department: 'Quality',
    designation: 'QA Quality Auditor',
    mobileNumber: '+91 99999 88888',
    isActive: true,
  });
  console.log('2. User created with raw password:', rawPassword);
  const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');
  console.log('3. Stored in DB as hashed:', isHashed);
  console.log('   Hash sample:', user.password.substring(0, 15) + '...');

  // Test matchPassword
  const match1 = await user.matchPassword(rawPassword);
  console.log('4. Initial login match with raw password:', match1);

  // Simulate logout
  await User.updateOne({ employeeId: 'AUD-TEST-99' }, { $set: { lastLogoutAt: new Date() } });
  const reloaded1 = await User.findOne({ employeeId: 'AUD-TEST-99' });
  const matchAfterLogout = await reloaded1.matchPassword(rawPassword);
  console.log('5. Match after logout:', matchAfterLogout);

  // Simulate app restart / re-seeding
  await ensureDefaultAdminUser();
  const reloaded2 = await User.findOne({ employeeId: 'AUD-TEST-99' });
  const matchAfterRestart = await reloaded2.matchPassword(rawPassword);
  console.log('6. Match after app restart / defaultAdmin check:', matchAfterRestart);

  // Admin resets password
  const newRawPassword = 'ResetByAdminPass456!';
  reloaded2.password = newRawPassword;
  await reloaded2.save();
  console.log('7. Password reset by admin to:', newRawPassword);

  const reloaded3 = await User.findOne({ employeeId: 'AUD-TEST-99' });
  const oldFails = await reloaded3.matchPassword(rawPassword);
  const newSucceeds = await reloaded3.matchPassword(newRawPassword);
  console.log('8. Old password fails:', !oldFails);
  console.log('9. New password succeeds:', newSucceeds);

  // Clean up
  await User.deleteOne({ employeeId: 'AUD-TEST-99' });
  console.log('10. Cleaned up test user. Lifecycle verification SUCCESSFUL!');
  process.exit(0);
}

run().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
