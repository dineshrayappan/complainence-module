const bcrypt = require('bcryptjs');
const User = require('../models/User');

/**
 * Ensures the default administrator user exists in MongoDB with credentials:
 * Username / Identifier: admin (or ADMIN, ADM-001, admin@factory.com)
 * Password:             admin123
 */
const ensureDefaultAdminUser = async () => {
  try {
    // Search for existing root admin account
    let admin = await User.findOne({
      $or: [
        { employeeId: 'ADMIN' },
        { employeeId: 'ADM-001' },
        { email: 'admin@factory.com' },
        { email: 'admin@admin.com' },
      ],
    });

    if (!admin) {
      admin = await User.create({
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
      // Validate password compatibility
      const isPasswordValid = await admin.matchPassword('admin123');
      let changed = false;

      if (!isPasswordValid) {
        admin.password = 'admin123';
        changed = true;
      }

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
        console.log('👑 [Database] Default admin user synchronized with password "admin123"');
      } else {
        console.log(`👑 [Database] Default admin user verified: ID: ${admin.employeeId} | Password: admin123`);
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
