const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const emailService = require('../services/emailService');
const {
  INSTITUTIONS,
  getInstitutionTypeFilter,
  normalizeInstitutionType
} = require('../config/institutions');

const generateToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required to issue authentication tokens.');
  }
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
      name: user.name,
      identifier: user.adminId || user.teacherId || user.usn,
      institutionType: user.institutionType || 'institute'
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

const isValidAdminRegistrationCode = (providedCode) => {
  const expectedCode = process.env.ADMIN_REGISTRATION_CODE || process.env.ADMIN_SECRET_KEY;
  if (!expectedCode || typeof providedCode !== 'string') return false;
  const provided = Buffer.from(providedCode);
  const expected = Buffer.from(expectedCode);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
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
      branch,
      department,
      semester,
      section,
      phone,
      institutionType,
      standard,
      pucYear,
      pucDept,
      parentsEmail,
      adminRegistrationCode
    } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and role are required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const instType = normalizeInstitutionType(institutionType || 'institute');

    if (!INSTITUTIONS[instType]) {
      return res.status(400).json({ success: false, message: 'Select a valid institution type.' });
    }

    if (!['admin', 'teacher', 'student'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be admin, teacher, or student.' });
    }

    let tenantAdminId = null;
    if (role === 'admin') {
      if (!process.env.ADMIN_REGISTRATION_CODE && !process.env.ADMIN_SECRET_KEY) {
        return res.status(503).json({
          success: false,
          message: 'Admin registration is not configured. Set ADMIN_REGISTRATION_CODE on the server.'
        });
      }
      if (!isValidAdminRegistrationCode(adminRegistrationCode)) {
        return res.status(403).json({ success: false, message: 'Invalid admin invitation code.' });
      }
      const ownerAdmins = await User.find({
        role: 'admin',
        institutionType: getInstitutionTypeFilter(instType),
        createdByAdmin: null
      }).select('_id').limit(2);
      if (ownerAdmins.length > 1) {
        return res.status(409).json({
          success: false,
          message: 'Admin registration is unavailable because this institution has multiple tenant owners.'
        });
      }
      tenantAdminId = ownerAdmins[0]?._id || null;
    } else {
      const institutionAdmins = await User.find({
        role: 'admin',
        isActive: true,
        institutionType: getInstitutionTypeFilter(instType),
        createdByAdmin: null
      }).select('_id').limit(2);
      if (institutionAdmins.length !== 1) {
        return res.status(409).json({
          success: false,
          message: institutionAdmins.length
            ? 'Registration cannot choose between multiple administrators for this institution.'
            : 'Registration is not available for this institution yet.'
        });
      }
      tenantAdminId = institutionAdmins[0]._id;
    }

    const selectedBranch = (branch || department || '').trim();
    const selectedPucYear = (pucYear || '').trim();
    const selectedPucDept = (pucDept || '').trim();
    const selectedStandard = (standard || '').trim();

    if (role !== 'admin' && (instType === 'institute' || instType === 'diploma') &&
        !INSTITUTIONS[instType].branches.includes(selectedBranch)) {
      return res.status(400).json({ success: false, message: 'Choose a valid branch for this institution.' });
    }

    if (role !== 'admin' && instType === 'pu_college' &&
        (!INSTITUTIONS.pu_college.pucYears.includes(selectedPucYear) ||
         !INSTITUTIONS.pu_college.pucDepts.includes(selectedPucDept))) {
      return res.status(400).json({ success: false, message: 'Choose a valid PUC year and department.' });
    }

    if (instType === 'school' && role === 'student' &&
        !INSTITUTIONS.school.standards.includes(selectedStandard)) {
      return res.status(400).json({ success: false, message: 'Choose a valid school standard.' });
    }

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
      createdByAdmin: tenantAdminId,
      department: instType === 'school'
        ? ''
        : instType === 'pu_college'
          ? selectedPucDept
          : selectedBranch,
      branch: instType === 'institute' || instType === 'diploma' ? selectedBranch : '',
      phone: phone || ''
    };

    // Role-specific validation and assignment
    if (role === 'admin') {
      if (!adminId || !adminId.trim()) {
        return res.status(400).json({ success: false, message: 'Admin ID is required for administrator registration.' });
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
      if (instType === 'pu_college') {
        userData.pucYear = selectedPucYear;
        userData.pucDept = selectedPucDept;
      }
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
            message: "Parent's Email ID is required for school student registration."
          });
        }
        userData.parentsEmail = parentsEmail.trim().toLowerCase();
        userData.standard = selectedStandard;
      } else if (instType === 'pu_college') {
        userData.pucYear = selectedPucYear;
        userData.pucDept = selectedPucDept;
        if (parentsEmail && parentsEmail.trim()) {
          userData.parentsEmail = parentsEmail.trim().toLowerCase();
        }
      } else {
        // institute or diploma
        if (parentsEmail && parentsEmail.trim()) {
          userData.parentsEmail = parentsEmail.trim().toLowerCase();
        }
        const selectedSemester = Number(semester);
        if (!INSTITUTIONS[instType].semesters.includes(selectedSemester)) {
          return res.status(400).json({ success: false, message: 'Choose a valid semester.' });
        }
        userData.semester = selectedSemester;
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
      userData.division = userData.section;
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
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'An account with this email or ID already exists.'
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration.'
    });
  }
};

exports.login = async (req, res) => {
  try {
    const identifier = String(req.body.identifier || '').trim();
    const password = req.body.password;
    const role = req.body.role;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Identifier and password are required.' });
    }

    const query = {
      $or: [
        { email: identifier.toLowerCase() },
        { adminId: identifier },
        { teacherId: identifier },
        { usn: identifier.toUpperCase() }
      ]
    };
    if (role) query.role = role;

    const user = await User.findOne(query);
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact Admin.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      token: generateToken(user),
      user: user.toSafeObject()
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during login.' });
  }
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
