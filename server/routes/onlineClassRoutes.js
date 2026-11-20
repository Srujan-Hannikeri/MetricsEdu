const express = require('express');
const router = express.Router();
const onlineClassController = require('../controllers/onlineClassController');
const { requireAuth, isTeacher } = require('../middleware/auth');

// Live class discovery & history
router.get('/active', requireAuth, onlineClassController.getActiveClasses);
router.get('/history', requireAuth, onlineClassController.getPastClasses);

// Teacher actions: Start class
router.post('/start', requireAuth, isTeacher, onlineClassController.startClass);

// Class details (supports both /:classId and /session/:classId)
router.get('/:classId', requireAuth, onlineClassController.getClassDetails);
router.get('/session/:classId', requireAuth, onlineClassController.getClassDetails);

// Teacher: End class
router.post('/:classId/end', requireAuth, isTeacher, onlineClassController.endClass);
router.post('/session/:classId/end', requireAuth, isTeacher, onlineClassController.endClass);

// Student & Teacher interactive actions
router.post('/:classId/join', requireAuth, onlineClassController.joinClass);
router.post('/session/:classId/join', requireAuth, onlineClassController.joinClass);

router.post('/:classId/heartbeat', requireAuth, onlineClassController.heartbeat);
router.post('/session/:classId/heartbeat', requireAuth, onlineClassController.heartbeat);

router.post('/:classId/chat', requireAuth, onlineClassController.sendChatMessage);
router.post('/:classId/message', requireAuth, onlineClassController.sendChatMessage);
router.post('/session/:classId/chat', requireAuth, onlineClassController.sendChatMessage);
router.post('/session/:classId/message', requireAuth, onlineClassController.sendChatMessage);

router.post('/:classId/raise-hand', requireAuth, onlineClassController.toggleRaiseHand);
router.post('/session/:classId/raise-hand', requireAuth, onlineClassController.toggleRaiseHand);
router.post('/:classId/lower-hand', requireAuth, onlineClassController.lowerHand);
router.post('/session/:classId/lower-hand', requireAuth, onlineClassController.lowerHand);

// WebRTC Signaling
router.post('/:classId/signal', requireAuth, onlineClassController.sendSignal);
router.post('/session/:classId/signal', requireAuth, onlineClassController.sendSignal);

router.get('/:classId/signals', requireAuth, onlineClassController.getSignals);
router.get('/session/:classId/signals', requireAuth, onlineClassController.getSignals);

module.exports = router;
