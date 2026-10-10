const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const User = require('../models/User');

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.log(`
Usage:
  node scripts/create_user.js <employeeId> <name> <email> <password> [role] [department] [designation] [mobileNumber]

Examples:
  node scripts/create_user.js ADM-002 "Sarah Connor" sarah@factory.com mypass123 ADMIN Operations Director
  node scripts/create_user.js AUD-003 "John Doe" john@factory.com mypass123 AUDITOR Quality "QA Inspector"
  node scripts/create_user.js SUP-002 "Jane Smith" jane@factory.com mypass123 ACTION_PERSON Production "Floor Supervisor"
    `);
    process.exit(1);
  }

  const [employeeId, name, email, password, role = 'ACTION_PERSON', department = 'Production', designation = 'Supervisor', mobileNumber = ''] = args;

  const uri = process.env.MONGODB_URI || 'mongodb+srv://dineshrayappanr_db_user:cDRacfh8jnr2r8r4@cluster0.dop3n2g.mongodb.net/compliance_module?appName=Cluster0';
  await mongoose.connect(uri);

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const normalizedRole = role.toUpperCase() === 'SUPERVISOR' ? 'ACTION_PERSON' : role.toUpperCase();

  const user = await User.findOneAndUpdate(
    { $or: [{ employeeId: employeeId.toUpperCase() }, { email: email.toLowerCase() }] },
    {
      $set: {
        employeeId: employeeId.toUpperCase(),
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        role: normalizedRole,
        department,
        designation,
        mobileNumber,
        isActive: true,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  console.log(`✅ User successfully created/updated in MongoDB:`);
  console.log(`   Employee ID: ${user.employeeId}`);
  console.log(`   Name:        ${user.name}`);
  console.log(`   Email:       ${user.email}`);
  console.log(`   Role:        ${user.role}`);
  console.log(`   Password:    ${password}`);
  console.log(`   Department:  ${user.department}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error creating user:', err.message);
  process.exit(1);
});
