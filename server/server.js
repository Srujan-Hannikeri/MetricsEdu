require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const passport = require('passport');
const setupPassport = require('./config/passport');

// Import Route handlers
const authRoutes = require('./routes/authRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const studentRoutes = require('./routes/studentRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Passport
app.use(passport.initialize());
setupPassport();

// Serve static uploaded files (Classroom photos & student faces)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check / info
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    platform: 'MetricsEdu',
    tagline: 'One Connected Platform. One Smart Classroom',
    timestamp: new Date().toISOString()
  });
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Connect to MongoDB & Start Server
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/metricsedu';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB at:', MONGO_URI);
    app.listen(PORT, () => {
      console.log(`🚀 MetricsEdu Server running on http://localhost:${PORT}`);
      console.log(`🎓 "One Connected Platform. One Smart Classroom"`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    console.log('⚠️ Starting HTTP server in degraded mode to allow configuration and troubleshooting...');
    app.listen(PORT, () => {
      console.log(`🚀 MetricsEdu Server running on http://localhost:${PORT} (Pending Database Connection)`);
    });
  });
