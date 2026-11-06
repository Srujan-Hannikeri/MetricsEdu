const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Public Auth routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp', authController.verifyResetOTP);
router.post('/reset-password', authController.resetPassword);

// Protected Auth check
router.get('/me', requireAuth, authController.getMe);

module.exports = router;
