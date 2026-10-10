const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { isMongoConnected } = require('../config/db');
const User = require('../models/User');
const Department = require('../models/Department');
const mockStore = require('../config/mockStore');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const uploadsDir = path.join(__dirname, '..', 'uploads');

const ensureUploadsDir = () => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
};

const initialDepartments = [
  { name: 'Production', code: 'PROD', manager: 'Rajesh Kumar', headcount: 280 },
  { name: 'Quality', code: 'QA', manager: 'Kavita Nair', headcount: 35 },
  { name: 'Maintenance', code: 'MAINT', manager: 'Vikram Singh', headcount: 22 },
  { name: 'Stores', code: 'STORE', manager: 'Ramesh Patel', headcount: 18 },
  { name: 'EHS', code: 'EHS', manager: 'Sunil Verma', headcount: 12 },
  { name: 'EDP', code: 'EDP', manager: 'Deepak Joshi', headcount: 8 },
  { name: 'HR', code: 'HR', manager: 'Meera Swaminathan', headcount: 15 },
];

const seedData = async () => {
  ensureUploadsDir();

  // If MongoDB is connected, seed MongoDB collections
  if (isMongoConnected()) {
    try {
      console.log('[Seed] Checking MongoDB data collections...');

      // Seed Departments
      const deptCount = await Department.countDocuments();
      if (deptCount === 0) {
        await Department.insertMany(initialDepartments);
        console.log('✅ [Seed] Standard factory departments seeded into MongoDB.');
      }

      // Seed / Update standard users - Keep ONLY Administrator
      const salt = await bcrypt.genSalt(10);
      const adminPassword = await bcrypt.hash('admin123', salt);

      const standardUsers = [
        {
          employeeId: 'ADM-001',
          name: 'Administrator',
          email: 'admin@factory.com',
          password: adminPassword,
          role: 'ADMIN',
          department: 'Plant Operations & Executive Oversight',
          designation: 'General Operations Director',
          mobileNumber: '+91 98000 11223',
          isActive: true,
        },
      ];

      // Remove demo non-admin users so only production Admin remains
      await User.deleteMany({
        $or: [
          { role: { $ne: 'ADMIN' } },
          { email: { $in: ['auditor@factory.com', 'dineshrayappan.r@gmail.com', 'all@factory.com', 'supervisor@factory.com', 'arif@factory.com', 'priya@factory.com', 'kamal@factory.com', 'sunita@factory.com', 'ramesh@factory.com', 'kavita@factory.com', 'vikram@factory.com'] } }
        ],
        employeeId: { $nin: ['ADMIN', 'ADM-001'] },
      });

      for (const u of standardUsers) {
        const query =
          u.role === 'ADMIN' && u.email === 'admin@factory.com'
            ? { $or: [{ employeeId: 'ADMIN' }, { employeeId: 'ADM-001' }, { email: u.email }] }
            : { $or: [{ employeeId: u.employeeId }, { email: u.email }] };
        await User.findOneAndUpdate(
          query,
          { $set: u },
          { upsert: true, returnDocument: 'after' }
        );
      }

      const { ensureDefaultAdminUser } = require('../utils/defaultAdmin');
      await ensureDefaultAdminUser();

      console.log('✅ [Seed] Administrator user verified in MongoDB (demo data purged).');
    } catch (err) {
      console.warn('⚠️ [Seed] MongoDB seed notice:', err.message);
    }
  } else {
    console.log('⚡ [Seed] MongoDB not connected. Seed ready for offline in-memory store.');
  }
};

// Allow standalone running: node scripts/seed.js
if (require.main === module) {
  const { connectDB } = require('../config/db');
  connectDB().then(() => {
    seedData().then(() => {
      console.log('[Seed] Done.');
      process.exit(0);
    });
  });
}

module.exports = { seedData };
