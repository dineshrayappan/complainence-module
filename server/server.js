const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const { supabase, isSupabaseConfigured, testConnection } = require('./config/supabase');
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
        if (isSupabaseConfigured && supabase) {
          const connected = await testConnection();
          if (connected) {
            console.log('⚡ [Server] Supabase PostgreSQL operational.');
          } else {
            console.log('⚡ [Server] Supabase ping returned non-fatal notice. Operating with resilient fallback.');
          }
        } else {
          console.log('⚡ [Server] Supabase not yet configured in .env. Resilient in-memory store active.');
        }
        await seedData();
      } catch (err) {
        console.warn('⚠️ [Server] Database initialization notice:', err.message);
      }
    })();
  }
  return dbPromise;
};

// Health check endpoint (always accessible without DB dependency)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    system: 'Textile & Garment QMS Complaints System',
    database: isSupabaseConfigured ? 'Supabase (PostgreSQL)' : 'In-Memory Resilient Store',
    timestamp: new Date().toISOString(),
  });
});

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

// Start standalone server only when executed directly (not when required as module or in serverless)
if (require.main === module) {
  ensureDBConnected()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`🧵 GARMENT QMS SERVER ONLINE ON PORT ${PORT}`);
        console.log(`📍 REST API: http://localhost:${PORT}/api`);
        console.log(`📸 Proof Uploads: http://localhost:${PORT}/uploads`);
        console.log(`🗄️ Database: ${isSupabaseConfigured ? 'Supabase PostgreSQL' : 'Resilient In-Memory Mode'}`);
        console.log(`=======================================================`);
      });
    })
    .catch((err) => {
      console.error('Fatal database startup failure:', err);
    });
}

module.exports = app;
