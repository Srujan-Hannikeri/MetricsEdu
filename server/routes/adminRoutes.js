const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAuth, isAdmin, isTeacher } = require('../middleware/auth');

// ─── Stats & Users ────────────────────────────────────────────────────────────
router.get('/stats', requireAuth, isAdmin, adminController.getAdminStats);
router.get('/users', requireAuth, isAdmin, adminController.getUsers);
router.patch('/users/:userId/toggle-status', requireAuth, isAdmin, adminController.toggleUserStatus);

// ─── Courses ─────────────────────────────────────────────────────────────────
// IMPORTANT: specific sub-routes must come BEFORE parameterised /:id routes
router.get('/courses', requireAuth, isAdmin, adminController.getCourses);
router.post('/courses/assign-teacher', requireAuth, isAdmin, adminController.assignTeacherToCourse);
router.post('/courses', requireAuth, isAdmin, adminController.createCourse);

// ─── Timetable ───────────────────────────────────────────────────────────────
// Named/specific routes first, parameterised /:id routes last
router.get('/timetables', requireAuth, adminController.getTimetables);
router.post('/timetables/auto-generate', requireAuth, isAdmin, adminController.autoGenerateTimetable);
router.get('/timetables/teacher/:teacherId/active-slot', requireAuth, isTeacher, adminController.getTeacherActiveSlot);
router.get('/timetables/teacher/:teacherId', requireAuth, isTeacher, adminController.getTeacherTimetable);
router.post('/timetables', requireAuth, isAdmin, adminController.createTimetableEntry);
router.put('/timetables/:id', requireAuth, isAdmin, adminController.updateTimetableEntry);
router.delete('/timetables/:id', requireAuth, isAdmin, adminController.deleteTimetableEntry);

// ─── Division Allocation ─────────────────────────────────────────────────────
router.post('/divisions/allocate', requireAuth, isAdmin, adminController.allocateDivisions);

// ─── Faculty Tracker ──────────────────────────────────────────────────────────
router.get('/faculty-tracker', requireAuth, isAdmin, adminController.getFacultyTracker);

module.exports = router;
