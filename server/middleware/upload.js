const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const classroomDir = path.join(__dirname, '../uploads/classroom');
const studentDir = path.join(__dirname, '../uploads/students');

if (!fs.existsSync(classroomDir)) {
  fs.mkdirSync(classroomDir, { recursive: true });
}
if (!fs.existsSync(studentDir)) {
  fs.mkdirSync(studentDir, { recursive: true });
}

// Storage for Classroom group photos
const classroomStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, classroomDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `class_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

// Storage for Student Profile face registration photos
const studentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, studentDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `student_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WebP) are allowed!'), false);
  }
};

const uploadClassroom = multer({
  storage: classroomStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max for high-res classroom photos
  fileFilter
});

const uploadStudent = multer({
  storage: studentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter
});

module.exports = {
  uploadClassroom,
  uploadStudent
};
