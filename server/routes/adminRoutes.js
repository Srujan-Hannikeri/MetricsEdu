const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAuth, isAdmin } = require('../middleware/auth');

// Admin Stats & Users
router.get('/stats', requireAuth, isAdmin, adminController.getAdminStats);
router.get('/users', requireAuth, isAdmin, adminController.getUsers);
router.patch('/users/:userId/toggle-status', requireAuth, isAdmin, adminController.toggleUserStatus);

// Course Management & Teacher Assignment
router.get('/courses', requireAuth, adminController.getCourses);
router.post('/courses', requireAuth, isAdmin, adminController.createCourse);
router.post('/courses/assign-teacher', requireAuth, isAdmin, adminController.assignTeacherToCourse);

// Timetable Management (Manual & Automated)
router.get('/timetables', requireAuth, adminController.getTimetables);
router.post('/timetables', requireAuth, isAdmin, adminController.createTimetableEntry);
router.put('/timetables/:id', requireAuth, isAdmin, adminController.updateTimetableEntry);
router.delete('/timetables/:id', requireAuth, isAdmin, adminController.deleteTimetableEntry);
router.post('/timetables/auto-generate', requireAuth, isAdmin, adminController.autoGenerateTimetable);

// Division Allocation (Manual & Automated)
router.post('/divisions/allocate', requireAuth, isAdmin, adminController.allocateDivisions);

// Seed route (60 students, Divisions A & B, Timetables)
router.post('/seed', adminController.seedDemoData);

module.exports = router;
