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
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  } catch (err) {
    // In serverless / read-only filesystem environments, uploads directory warning is ignored
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

      // Seed Departments only if empty
      const deptCount = await Department.countDocuments();
      if (deptCount === 0) {
        await Department.insertMany(initialDepartments);
        console.log('✅ [Seed] Standard factory departments seeded into MongoDB.');
      }

      // Ensure root administrator exists without modifying or deleting other registered users
      const { ensureDefaultAdminUser } = require('../utils/defaultAdmin');
      await ensureDefaultAdminUser();

      console.log('✅ [Seed] Administrator user verified in MongoDB (all registered user accounts preserved).');
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
