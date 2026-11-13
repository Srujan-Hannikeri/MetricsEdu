const express = require('express');
const router = express.Router();
const devController = require('../controllers/devController');

// Dev Authentication (Login via master key)
router.post('/auth', devController.authenticateDev);

// Protected routes (Require valid developer session)
router.use(devController.requireDevAuth);

// Platform & Institution Analytics
router.get('/metrics', devController.getPlatformMetrics);

// ID & USN Generation Tool
router.post('/generate-ids', devController.generateIds);

// Bug & Feedback Management
router.get('/bugs', devController.getAllBugs);
router.patch('/bugs/:id', devController.updateBugStatus);
router.delete('/bugs/:id', devController.deleteBug);

module.exports = router;
