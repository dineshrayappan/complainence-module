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

      // Seed / Update standard users
      const salt = await bcrypt.genSalt(10);
      const adminPassword = await bcrypt.hash('admin123', salt);
      const auditorPassword = await bcrypt.hash('auditor123', salt);
      const supervisorPassword = await bcrypt.hash('supervisor123', salt);
      const masterPassword = await bcrypt.hash('master123', salt);

      const standardUsers = [
        {
          employeeId: 'ADM-001',
          name: 'Anil Mehta',
          email: 'admin@factory.com',
          password: adminPassword,
          role: 'ADMIN',
          department: 'Plant Operations & Executive Oversight',
          designation: 'General Operations Director',
          mobileNumber: '+91 98000 11223',
          isActive: true,
        },
        {
          employeeId: 'AUD-001',
          name: 'Pooja Sharma',
          email: 'auditor@factory.com',
          password: auditorPassword,
          role: 'AUDITOR',
          department: 'Central Quality Audit',
          designation: 'Senior QA Auditor',
          mobileNumber: '+91 98765 43210',
          isActive: true,
        },
        {
          employeeId: 'AUD-002',
          name: 'Dinesh Rayappan',
          email: 'dineshrayappan.r@gmail.com',
          password: auditorPassword,
          role: 'AUDITOR',
          department: 'Quality Assurance',
          designation: 'Lead Quality Auditor',
          mobileNumber: '+91 98765 43211',
          isActive: true,
        },
        {
          employeeId: 'ALL-001',
          name: 'Master QA Director',
          email: 'all@factory.com',
          password: masterPassword,
          role: 'ADMIN',
          department: 'Executive Operations',
          designation: 'Universal Multi-Role Director',
          mobileNumber: '+91 99999 00000',
          isActive: true,
        },
        {
          employeeId: 'SUP-001',
          name: 'Ramesh Patel',
          email: 'supervisor@factory.com',
          password: supervisorPassword,
          role: 'ACTION_PERSON',
          department: 'Production',
          designation: 'Floor Supervisor',
          mobileNumber: '+91 98111 22334',
          isActive: true,
        },
        {
          employeeId: 'SUP-101',
          name: 'Mohammad Arif',
          email: 'arif@factory.com',
          password: supervisorPassword,
          role: 'ACTION_PERSON',
          department: 'Production',
          designation: 'Sewing Line 1 In-Charge',
          mobileNumber: '+91 98111 22335',
          isActive: true,
        },
        {
          employeeId: 'SUP-102',
          name: 'Priya Sharma',
          email: 'priya@factory.com',
          password: supervisorPassword,
          role: 'ACTION_PERSON',
          department: 'Production',
          designation: 'Sewing Line 2 In-Charge',
          mobileNumber: '+91 98111 22336',
          isActive: true,
        },
        {
          employeeId: 'SUP-103',
          name: 'Kamal Hasan',
          email: 'kamal@factory.com',
          password: supervisorPassword,
          role: 'ACTION_PERSON',
          department: 'Stores',
          designation: 'Cutting Line Supervisor',
          mobileNumber: '+91 98111 22337',
          isActive: true,
        },
        {
          employeeId: 'SUP-104',
          name: 'Sunita Roy',
          email: 'sunita@factory.com',
          password: supervisorPassword,
          role: 'ACTION_PERSON',
          department: 'Maintenance',
          designation: 'Finishing & Packing Lead',
          mobileNumber: '+91 98111 22338',
          isActive: true,
        },
        {
          employeeId: 'SUP-105',
          name: 'Ramesh Patel',
          email: 'ramesh@factory.com',
          password: supervisorPassword,
          role: 'ACTION_PERSON',
          department: 'Stores',
          designation: 'Stores & Trims In-Charge',
          mobileNumber: '+91 98111 22339',
          isActive: true,
        },
        {
          employeeId: 'SUP-106',
          name: 'Kavita Deshmukh',
          email: 'kavita@factory.com',
          password: supervisorPassword,
          role: 'ACTION_PERSON',
          department: 'EHS',
          designation: 'EHS & Plant Safety Lead',
          mobileNumber: '+91 98111 22340',
          isActive: true,
        },
        {
          employeeId: 'SUP-999',
          name: 'Vikram Malhotra',
          email: 'vikram@factory.com',
          password: supervisorPassword,
          role: 'ACTION_PERSON',
          department: 'Quality',
          designation: 'End-Line QC Supervisor',
          mobileNumber: '+91 98111 22341',
          isActive: true,
        },
      ];

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

      console.log('✅ [Seed] Standard factory users verified in MongoDB.');
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
