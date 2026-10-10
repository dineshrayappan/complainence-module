const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const { connectDB, isMongoConnected } = require('./config/db');
const { seedData } = require('./scripts/seed');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const taskRoutes = require('./routes/taskRoutes');
const departmentRoutes = require('./routes/departmentRoutes');

const app = express();

// Enable CORS for frontend
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parser
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static uploads folder for camera photos
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));

// DB initialization promise for serverless and standalone execution
let dbPromise = null;
const ensureDBConnected = async () => {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const connected = await connectDB();
        if (connected) {
          console.log('⚡ [Server] MongoDB database operational.');
        } else {
          console.log('⚡ [Server] Operating with resilient fallback store.');
        }
        await seedData();
      } catch (err) {
        console.warn('⚠️ [Server] Database initialization notice:', err.message);
      }
    })();
  }
  return dbPromise;
};

// Ensure DB is ready on incoming API requests
app.use('/api', async (req, res, next) => {
  try {
    await ensureDBConnected();
    next();
  } catch (err) {
    console.error('[DB Initialization Error]:', err);
    next(err);
  }
});

// API Overview & Documentation helper (useful for Postman testing & browser verification)
const apiOverview = (req, res) => {
  res.status(200).json({
    success: true,
    name: 'Textile & Garment QMS Complaints System API',
    status: 'ONLINE',
    database: isMongoConnected() ? 'MongoDB (Connected)' : 'Resilient In-Memory Mode',
    message: 'Welcome to the Garment QMS REST API! Use the endpoints below to test with Postman.',
    auth: {
      loginEndpoint: 'POST /api/auth/login',
      testCredentials: [
        { role: 'ADMIN', identifier: 'admin@factory.com', password: 'admin123' },
        { role: 'AUDITOR (Dinesh)', identifier: 'dineshrayappan.r@gmail.com', password: 'auditor123' },
        { role: 'AUDITOR (Pooja)', identifier: 'auditor@factory.com', password: 'auditor123' },
        { role: 'SUPERVISOR', identifier: 'supervisor@factory.com', password: 'supervisor123' },
        { role: 'UNIVERSAL', identifier: 'all@factory.com', password: 'master123' },
      ],
      postmanInstructions: '1. Send POST /api/auth/login with {"identifier": "...", "password": "..."}.\n2. Copy the "token" from response.\n3. Add header "Authorization: Bearer <token>" to your Postman requests.'
    },
    endpoints: {
      health: 'GET /api/health',
      login: 'POST /api/auth/login',
      register: 'POST /api/auth/register',
      me: 'GET /api/auth/me',
      complaints: 'GET /api/complaints',
      createComplaint: 'POST /api/complaints',
      complaintDetail: 'GET /api/complaints/:id',
      kpiStats: 'GET /api/complaints/stats/kpi',
      adminOversight: 'GET /api/complaints/admin/oversight',
      departmentCompliance: 'GET /api/complaints/admin/department-compliance',
      tasks: 'GET /api/tasks',
      users: 'GET /api/users',
      departments: 'GET /api/departments',
    },
  });
};

// Root & overview endpoints for Postman / web probes
app.get('/', apiOverview);
app.get('/api', apiOverview);
app.get('/health', (req, res) => res.redirect('/api/health'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    system: 'Textile & Garment QMS Complaints System',
    database: isMongoConnected() ? 'MongoDB' : 'In-Memory Resilient Store',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/departments', departmentRoutes);

// Central Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Error]:', err);

  // Multer error handling
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`,
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;

// Start standalone server only when executed directly
if (require.main === module) {
  ensureDBConnected()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`🧵 GARMENT QMS SERVER ONLINE ON PORT ${PORT}`);
        console.log(`📍 REST API: http://localhost:${PORT}/api`);
        console.log(`📸 Proof Uploads: http://localhost:${PORT}/uploads`);
        console.log(`🗄️ Database: ${isMongoConnected() ? 'MongoDB' : 'Resilient In-Memory Mode'}`);
        console.log(`=======================================================`);
      });
    })
    .catch((err) => {
      console.error('Fatal database startup failure:', err);
    });
}

module.exports = app;
