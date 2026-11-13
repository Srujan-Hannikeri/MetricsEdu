const express = require('express');
const router = express.Router();
const marksController = require('../controllers/marksController');
const { requireAuth, isTeacher } = require('../middleware/auth');

// All routes require authentication
router.use(requireAuth);

// Authorization helper for individual student marks
const canViewStudentMarks = (req, res, next) => {
  if (['teacher', 'admin'].includes(req.user.role)) return next();
  if (req.user.role === 'student' && req.user._id.toString() === req.params.studentId.toString()) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Forbidden: You can only view your own marks.' });
};

// Teacher/Admin routes
router.get('/teacher-courses', isTeacher, marksController.getTeacherCourses);
router.get('/roster', isTeacher, marksController.getAssessmentRoster);
router.post('/batch-save', isTeacher, marksController.batchSaveMarks);
router.get('/overview', isTeacher, marksController.getMarksOverview);
router.get('/student/:studentId', canViewStudentMarks, marksController.getStudentMarksHistory);

module.exports = router;
