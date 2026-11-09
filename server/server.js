require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

// Import Route handlers
const authRoutes = require('./routes/authRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const studentRoutes = require('./routes/studentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const semesterRoutes = require('./routes/semesterRoutes');
const campusRoutes = require('./routes/campusRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const DATABASE_NAME = 'metricsedu';

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

let databaseConnection;
const connectDatabase = async () => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === DATABASE_NAME) {
    return mongoose.connection;
  }
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
    databaseConnection = null;
  }
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required to connect to the database.');
  if (!databaseConnection) {
    databaseConnection = mongoose.connect(process.env.MONGO_URI, { dbName: DATABASE_NAME }).catch(error => {
      databaseConnection = null;
      throw error;
    });
  }
  await databaseConnection;
  return mongoose.connection;
};

app.use('/api', async (req, res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

// Mount API routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/semesters', semesterRoutes);
app.use('/api/campus', campusRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MetricsEdu Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
