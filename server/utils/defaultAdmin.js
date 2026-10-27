const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { getRootUserModel } = require('../models/unitModels');

/**
 * Ensures the default administrator user exists in MongoDB with credentials:
 * Username / Identifier: admin (or ADMIN, ADM-001, admin@factory.com)
 * Password:             admin123
 */
const ensureDefaultAdminUser = async (targetConn = null) => {
  try {
    const UserModel = targetConn ? getRootUserModel(targetConn) : getRootUserModel();

    // Search for existing root admin account
    let admin = await UserModel.findOne({
      $or: [
        { employeeId: 'ADMIN' },
        { employeeId: 'ADM-001' },
        { email: 'admin@factory.com' },
        { email: 'admin@admin.com' },
      ],
    });

    if (!admin) {
      admin = await UserModel.create({
        employeeId: 'ADMIN',
        name: 'System Admin',
        email: 'admin@factory.com',
        password: 'admin123', // Hashed automatically by User pre-save hook
        role: 'ADMIN',
        department: 'Plant Operations & Executive Oversight',
        designation: 'General Operations Director',
        mobileNumber: '+91 98000 11223',
        isActive: true,
      });
      console.log('👑 [Database] Default admin user created successfully!');
      console.log('   ➔ Identifier: admin (or ADMIN / admin@factory.com)');
      console.log('   ➔ Password:   admin123');
    } else {
      // Administrator account already exists - strictly preserve their credentials & password!
      // Passwords must NEVER be automatically generated, modified, or reset on restart.
      let changed = false;

      if (!admin.isActive) {
        admin.isActive = true;
        changed = true;
      }

      if (admin.role !== 'ADMIN') {
        admin.role = 'ADMIN';
        changed = true;
      }

      if (changed) {
        await admin.save();
        console.log('👑 [Database] Default admin account status verified.');
      } else {
        console.log(`👑 [Database] Default admin user verified: ID: ${admin.employeeId} (Credentials strictly preserved)`);
      }
    }

    return admin;
  } catch (err) {
    console.error('⚠️ [Database] Error ensuring default admin user:', err.message);
  }
};

module.exports = {
  ensureDefaultAdminUser,
};
