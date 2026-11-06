const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { requireAuth, isStudent } = require('../middleware/auth');
const { uploadStudent } = require('../middleware/upload');

// Student routes
router.get('/dashboard', requireAuth, isStudent, studentController.getStudentDashboard);
router.post('/register-face', requireAuth, isStudent, uploadStudent.single('facePhoto'), studentController.registerFace);

module.exports = router;
