const passport = require('passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const emailService = require('../services/emailService');

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
      name: user.name,
      identifier: user.adminId || user.teacherId || user.usn,
      institutionType: user.institutionType || 'college'
    },
    process.env.JWT_SECRET || 'metricsedu_smart_classroom_jwt_secret_token_2026',
    { expiresIn: '7d' }
  );
};

// Mask email for security/privacy (e.g. j***n@domain.com)
const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.max(local.length - 2, 2))}${local[local.length - 1]}@${domain}`;
};

// Register Controller
exports.register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      adminId,
      teacherId,
      usn,
      department,
      semester,
      section,
      phone,
      institutionType,
      standard,
      parentsEmail
    } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and role are required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const instType = institutionType === 'school' ? 'school' : 'college';

    // Check if email already registered
    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email address already exists.'
      });
    }

    const userData = {
      name: name.trim(),
      email: cleanEmail,
      password,
      role,
      institutionType: instType,
      department: instType === 'school' ? (standard || 'High School') : (department || 'Computer Science & Engineering'),
      phone: phone || ''
    };

    // Role-specific validation and assignment
    if (role === 'admin') {
      if (!adminId || !adminId.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Admin ID is required for Admin registration.'
        });
      }
      const existingAdminId = await User.findOne({ adminId: adminId.trim() });
      if (existingAdminId) {
        return res.status(400).json({
          success: false,
          message: 'This Admin ID is already registered.'
        });
      }
      userData.adminId = adminId.trim();
    } else if (role === 'teacher') {
      if (!teacherId || !teacherId.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Teacher ID is required for Teacher / Lecturer registration.'
        });
      }
      const existingTeacherId = await User.findOne({ teacherId: teacherId.trim() });
      if (existingTeacherId) {
        return res.status(400).json({
          success: false,
          message: 'This Teacher ID is already registered.'
        });
      }
      userData.teacherId = teacherId.trim();
    } else if (role === 'student') {
      if (!usn || !usn.trim()) {
        return res.status(400).json({
          success: false,
          message: instType === 'school' ? 'Student Roll No / School ID is required.' : 'USN is required for Student registration.'
        });
      }

      // In school mode, parent's email is mandatory
      if (instType === 'school') {
        if (!parentsEmail || !parentsEmail.trim()) {
          return res.status(400).json({
            success: false,
            message: "Parent's Email ID is required for school student registration to send verification OTPs and attendance updates."
          });
        }
        userData.parentsEmail = parentsEmail.trim().toLowerCase();
        userData.standard = standard ? standard.trim() : '10th Std';
      } else {
        if (parentsEmail && parentsEmail.trim()) {
          userData.parentsEmail = parentsEmail.trim().toLowerCase();
        }
        userData.semester = Number(semester) || 6;
      }

      const cleanUsn = usn.trim().toUpperCase();
      const existingUsn = await User.findOne({ usn: cleanUsn });
      if (existingUsn) {
        return res.status(400).json({
          success: false,
          message: instType === 'school' ? 'This Student Roll No / ID is already registered.' : 'This USN is already registered.'
        });
      }
      userData.usn = cleanUsn;
      userData.section = section ? section.trim().toUpperCase() : 'A';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Role must be admin, teacher, or student.'
      });
    }

    const newUser = new User(userData);
    await newUser.save();

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: `${role.toUpperCase()} registered successfully! Welcome to MetricsEdu.`,
      token,
      user: newUser.toSafeObject()
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration.'
    });
  }
};

// Login Controller using Passport Local Strategy
exports.login = (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err) {
      console.error('Passport auth error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error during login' });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: info && info.message ? info.message : 'Invalid credentials'
      });
    }

    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      token,
      user: user.toSafeObject()
    });
  })(req, res, next);
};

// Get current logged-in user profile
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({
      success: true,
      user: user.toSafeObject()
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Forgot Password - Initiate OTP
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email address or parent email address.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Search for user by either account email or parent's email
    let user = await User.findOne({
      $or: [
        { email: cleanEmail },
        { parentsEmail: cleanEmail }
      ]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account registered with this email address.'
      });
    }

    // Determine target recipient (if school student or matched by parentsEmail, prioritize parentsEmail)
    const isParentMatch = user.parentsEmail && (cleanEmail === user.parentsEmail || user.institutionType === 'school');
    const recipientEmail = isParentMatch ? user.parentsEmail : (cleanEmail || user.email);

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    user.resetPasswordOTP = otp;
    user.resetPasswordExpires = expiry;
    await user.save();

    console.log(`[AUTH] Password Reset OTP generated for ${user.email} -> Target: ${recipientEmail} | OTP: ${otp}`);

    // Send email via emailService
    await emailService.sendPasswordResetOTP({
      toEmail: recipientEmail,
      recipientName: isParentMatch ? `Parent of ${user.name}` : user.name,
      otp,
      isParent: isParentMatch,
      studentName: user.name
    });

    return res.json({
      success: true,
      message: `A 6-digit verification code has been dispatched to ${maskEmail(recipientEmail)}.`,
      email: user.email,
      targetEmail: maskEmail(recipientEmail),
      isParent: isParentMatch,
      // For developer ease in local preview:
      devPreviewOtp: process.env.NODE_ENV !== 'production' ? otp : undefined
    });
  } catch (error) {
    console.error('forgotPassword error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error processing forgot password request.' });
  }
};

// Verify OTP
exports.verifyResetOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP code are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.toString().trim();

    const user = await User.findOne({
      $or: [{ email: cleanEmail }, { parentsEmail: cleanEmail }],
      resetPasswordOTP: cleanOtp,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code. Please request a new OTP.'
      });
    }

    return res.json({
      success: true,
      message: 'Verification code verified successfully.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, verification code, and new password are required.'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = otp.toString().trim();

    const user = await User.findOne({
      $or: [{ email: cleanEmail }, { parentsEmail: cleanEmail }],
      resetPasswordOTP: cleanOtp,
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired verification code.'
      });
    }

    // Update password (pre-save hook will hash it)
    user.password = newPassword;
    user.resetPasswordOTP = null;
    user.resetPasswordExpires = null;
    await user.save();

    console.log(`[AUTH] Password successfully reset for user ${user.email}`);

    return res.json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.'
    });
  } catch (error) {
    console.error('resetPassword error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error resetting password.' });
  }
};
