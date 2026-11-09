const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { requireAuth, isTeacher } = require('../middleware/auth');
const { uploadClassroom } = require('../middleware/upload');

// Teacher routes
router.get('/courses', requireAuth, isTeacher, attendanceController.getTeacherCourses);
router.get('/course/:courseId/students', requireAuth, isTeacher, attendanceController.getCourseStudents);
router.post('/process-photo', requireAuth, isTeacher, uploadClassroom.any(), attendanceController.processClassroomAttendance);
router.get('/sessions', requireAuth, isTeacher, attendanceController.getTeacherSessions);
router.get('/session/:sessionId', requireAuth, attendanceController.getSessionById);
router.patch('/session/:sessionId/student/:studentId', requireAuth, isTeacher, attendanceController.updateStudentRecord);
router.get('/session/:sessionId/export-csv', requireAuth, attendanceController.exportAttendanceCSV);

// Check if attendance window is open for a specific course right now
router.get('/window-check/:courseId', requireAuth, isTeacher, attendanceController.checkWindowForCourse);

module.exports = router;
