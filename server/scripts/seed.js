const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { supabase, isSupabaseConfigured } = require('../config/supabase');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const uploadsDir = path.join(__dirname, '..', 'uploads');

// Helper to ensure uploads directory exists
const ensureUploadsDir = () => {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
};

const seedData = async () => {
  ensureUploadsDir();

  if (!isSupabaseConfigured || !supabase) {
    console.log('⚡ [Seed] Supabase credentials not set in .env. Falling back to built-in in-memory mock store.');
    return;
  }

  try {
    console.log('[Seed] Seeding Supabase PostgreSQL database...');

    const salt = await bcrypt.genSalt(10);
    const adminPassword = await bcrypt.hash('admin123', salt);
    const auditorPassword = await bcrypt.hash('auditor123', salt);
    const supervisorPassword = await bcrypt.hash('supervisor123', salt);

    const initialUsers = [
      {
        id: 'usr-adm-001',
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
        id: 'usr-aud-001',
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
        id: 'usr-aud-002',
        employeeId: 'AUD-002',
        name: 'Dinesh Rayappan',
        email: 'dinesh@factory.com',
        password: auditorPassword,
        role: 'AUDITOR',
        department: 'Central Quality Audit',
        designation: 'Internal Quality Auditor',
        mobileNumber: '+91 98111 55667',
        isActive: true,
      },
      {
        id: 'usr-sup-001',
        employeeId: 'SUP-001',
        name: 'Rajesh Kumar',
        email: 'supervisor@factory.com',
        password: supervisorPassword,
        role: 'ACTION_PERSON',
        department: 'Production',
        designation: 'Production Floor In-Charge',
        mobileNumber: '+91 98111 22334',
        isActive: true,
      },
      {
        id: 'usr-sup-002',
        employeeId: 'SUP-002',
        name: 'Kavita Nair',
        email: 'quality@factory.com',
        password: supervisorPassword,
        role: 'ACTION_PERSON',
        department: 'Quality',
        designation: 'Quality Control Lead',
        mobileNumber: '+91 98222 33445',
        isActive: true,
      },
      {
        id: 'usr-sup-003',
        employeeId: 'SUP-003',
        name: 'Vikram Singh',
        email: 'maintenance@factory.com',
        password: supervisorPassword,
        role: 'ACTION_PERSON',
        department: 'Maintenance',
        designation: 'Maintenance Chief Engineer',
        mobileNumber: '+91 98333 44556',
        isActive: true,
      },
      {
        id: 'usr-sup-004',
        employeeId: 'SUP-004',
        name: 'Ramesh Patel',
        email: 'store@factory.com',
        password: supervisorPassword,
        role: 'ACTION_PERSON',
        department: 'Store',
        designation: 'Store & Inventory Manager',
        mobileNumber: '+91 98444 55667',
        isActive: true,
      },
      {
        id: 'usr-sup-005',
        employeeId: 'SUP-005',
        name: 'Sunil Verma',
        email: 'ehs@factory.com',
        password: supervisorPassword,
        role: 'ACTION_PERSON',
        department: 'EHS',
        designation: 'EHS Safety Officer',
        mobileNumber: '+91 98555 66778',
        isActive: true,
      },
      {
        id: 'usr-sup-006',
        employeeId: 'SUP-006',
        name: 'Deepak Joshi',
        email: 'edp@factory.com',
        password: supervisorPassword,
        role: 'ACTION_PERSON',
        department: 'EDP',
        designation: 'EDP & Systems Specialist',
        mobileNumber: '+91 98666 77889',
        isActive: true,
      },
      {
        id: 'usr-sup-007',
        employeeId: 'SUP-007',
        name: 'Meera Swaminathan',
        email: 'hr@factory.com',
        password: supervisorPassword,
        role: 'ACTION_PERSON',
        department: 'HR',
        designation: 'HR & Compliance Manager',
        mobileNumber: '+91 98777 88990',
        isActive: true,
      },
      {
        id: 'usr-all-001',
        employeeId: 'ALL-001',
        name: 'Universal User (Auditor/Admin/Supervisor)',
        email: 'all@factory.com',
        password: adminPassword,
        role: 'ADMIN',
        department: 'Plant Operations & Quality Oversight',
        designation: 'Master Operations & QA Lead',
        mobileNumber: '+91 99999 88888',
        isActive: true,
      },
    ];

    const { count: userCount, error: countErr } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (!countErr && (userCount === 0 || userCount === null)) {
      const { error: userErr } = await supabase.from('users').insert(initialUsers);
      if (userErr) {
        console.warn('⚠️ [Seed] Users insert notice:', userErr.message);
      } else {
        console.log('✅ [Seed] Factory Users successfully seeded in Supabase.');
      }
    } else {
      console.log(`✅ [Seed] Users table already has ${userCount} records. Preserving existing user accounts.`);
    }

    console.log('✅ [Seed] Complaints table initialized clean with zero demo records.');
  } catch (err) {
    console.error('❌ [Seed] Error during seeding:', err.message);
  }
};

if (require.main === module) {
  seedData()
    .then(() => {
      console.log('🎉 Seeding completed!');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedData };
