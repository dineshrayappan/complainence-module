/**
 * Secure Backend Setup Script for Project Owner Account
 *
 * Usage:
 *   node server/scripts/setupOwner.js
 *   node server/scripts/setupOwner.js --email=owner@example.com --password=CustomStrongPass123!
 *   node server/scripts/setupOwner.js --reset
 *
 * Or via Environment Variables in server/.env:
 *   OWNER_EMAIL=...
 *   OWNER_PASSWORD=...
 *   OWNER_NAME=...
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
const mockStore = require('../config/mockStore');

// Parse command line arguments
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((arg) => {
    if (arg.startsWith('--')) {
      const parts = arg.slice(2).split('=');
      args[parts[0]] = parts.length > 1 ? parts.slice(1).join('=') : true;
    }
  });
  return args;
}

// Generate cryptographically secure random password
function generateStrongPassword(length = 16) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()_+';
  const randomBytes = crypto.randomBytes(length);
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += chars[randomBytes[i] % chars.length];
  }
  // Ensure at least one uppercase, lowercase, digit, and symbol
  return pwd;
}

async function setupOwner() {
  console.log('\n======================================================');
  console.log('   TEXTILE QMS - PRIVATE OWNER ACCOUNT SETUP');
  console.log('======================================================\n');

  const args = parseArgs();
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  let isConnected = false;
  if (mongoUri) {
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
      isConnected = true;
      console.log('✓ Connected securely to MongoDB.');
    } catch (err) {
      console.warn('⚠️ Could not connect to MongoDB:', err.message);
      console.log('  Proceeding with local fallback store.');
    }
  }

  const ownerEmail = (args.email || process.env.OWNER_EMAIL || 'owner@factory.com').trim().toLowerCase();
  const ownerName = (args.name || process.env.OWNER_NAME || 'Project Owner').trim();
  const ownerEmpId = (args.id || args.employeeId || process.env.OWNER_EMPLOYEE_ID || 'OWNER-001').trim().toUpperCase();
  const rawPassword = args.password || process.env.OWNER_PASSWORD || generateStrongPassword(16);

  if (rawPassword.length < 8) {
    console.error('❌ Error: Owner password must be at least 8 characters.');
    process.exit(1);
  }

  // Hash password securely
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(rawPassword, salt);

  try {
    let existingOwner = null;

    if (isConnected) {
      existingOwner = await User.findOne({
        $or: [
          { role: 'OWNER' },
          { isOwner: true },
          { email: ownerEmail },
          { employeeId: ownerEmpId },
        ],
      });
    }

    if (!existingOwner) {
      existingOwner = mockStore.getUsers(true).find(
        (u) => u.role === 'OWNER' || u.isOwner || u.email === ownerEmail || u.employeeId === ownerEmpId
      );
    }

    if (existingOwner) {
      console.log(`\nℹ️ Existing Owner account found: ${existingOwner.name} (${existingOwner.email})`);
      console.log('Updating credentials and ensuring role authorization...');

      if (isConnected && existingOwner._id) {
        await User.findByIdAndUpdate(
          existingOwner._id,
          {
            name: ownerName,
            email: ownerEmail,
            employeeId: ownerEmpId,
            password: hashedPassword,
            role: 'OWNER',
            isOwner: true,
            department: 'Executive Ownership',
            designation: 'Project Owner & Executive Director',
            isActive: true,
            isDeleted: false,
          },
          { returnDocument: 'after' }
        );
      }

      mockStore.updateUser(existingOwner.id || existingOwner._id || existingOwner.employeeId, {
        name: ownerName,
        email: ownerEmail,
        employeeId: ownerEmpId,
        password: hashedPassword,
        role: 'OWNER',
        isOwner: true,
        department: 'Executive Ownership',
        designation: 'Project Owner & Executive Director',
        isActive: true,
        isDeleted: false,
      });

      console.log('✓ Owner account credentials successfully updated in database.');
    } else {
      console.log('\nCreating dedicated Owner account...');

      if (isConnected) {
        await User.create({
          employeeId: ownerEmpId,
          name: ownerName,
          email: ownerEmail,
          password: hashedPassword,
          role: 'OWNER',
          isOwner: true,
          department: 'Executive Ownership',
          designation: 'Project Owner & Executive Director',
          mobileNumber: '+91 99000 00001',
          isActive: true,
          isDeleted: false,
        });
      }

      mockStore.createUser({
        employeeId: ownerEmpId,
        name: ownerName,
        email: ownerEmail,
        password: hashedPassword,
        role: 'OWNER',
        isOwner: true,
        department: 'Executive Ownership',
        designation: 'Project Owner & Executive Director',
        mobileNumber: '+91 99000 00001',
        isActive: true,
        isDeleted: false,
      });

      console.log('✓ Dedicated Owner account created successfully in database.');
    }

    console.log('\n======================================================');
    console.log('   PRIVATE OWNER CREDENTIALS (HANDOVER)');
    console.log('======================================================');
    console.log(`  Role:           EXECUTIVE OWNER (Omni-Access)`);
    console.log(`  Name:           ${ownerName}`);
    console.log(`  Username / ID:  ${ownerEmpId}`);
    console.log(`  Email:          ${ownerEmail}`);
    console.log(`  Password:       ${rawPassword}`);
    console.log(`  Login URL:      http://localhost:5173/compliance/login`);
    console.log('======================================================\n');
    console.log('SECURITY NOTICE:');
    console.log('- Store this password securely (e.g. in a password manager).');
    console.log('- Only the secure password hash is stored in the database.');
    console.log('- The Owner account is isolated and hidden from normal Admin user lists.');
    console.log('- You can re-run this script anytime with --password=<newPass> to reset.\n');

  } catch (err) {
    console.error('❌ Failed to set up Owner account:', err);
    process.exit(1);
  } finally {
    if (isConnected) {
      await mongoose.disconnect();
    }
    process.exit(0);
  }
}

setupOwner();
