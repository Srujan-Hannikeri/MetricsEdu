const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const BugFeedback = require('../models/BugFeedback');
const DeveloperKey = require('../models/DeveloperKey');

const DEV_KEY = process.env.DEV_ACCESS_KEY || 'metrics-dev-2026';
const JWT_SECRET = process.env.JWT_SECRET || 'metricsedu_secret_key_2026';

// ── Developer Authentication ────────────────────────────────────────────────
exports.authenticateDev = async (req, res) => {
  try {
    const { accessKey } = req.body;
    if (!accessKey || !accessKey.trim()) {
      return res.status(401).json({ success: false, message: 'Developer access key is required.' });
    }

    const keyStr = accessKey.trim();
    let memberLabel = 'Core Team Lead';

    if (keyStr === DEV_KEY) {
      memberLabel = 'Master Lead Developer';
    } else {
      const dbKey = await DeveloperKey.findOne({ key: keyStr, isActive: true });
      if (!dbKey) {
        return res.status(401).json({ success: false, message: 'Invalid or revoked developer access key.' });
      }
      dbKey.lastUsedAt = new Date();
      await dbKey.save();
      memberLabel = dbKey.label || 'Team Member';
    }

    const token = jwt.sign(
      { role: 'developer', name: memberLabel },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      memberLabel,
      message: 'Developer access granted. Welcome to MetricsEdu Core Console.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── Middleware for dev route authorization ──────────────────────────────────
exports.requireDevAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const devHeader = req.headers['x-dev-key'];

    if (devHeader) {
      const cleanDevKey = devHeader.trim();
      if (cleanDevKey === DEV_KEY || await DeveloperKey.exists({ key: cleanDevKey, isActive: true })) {
        req.isDev = true;
        return next();
      }
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token === DEV_KEY || await DeveloperKey.exists({ key: token, isActive: true })) {
        req.isDev = true;
        return next();
      }
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role === 'developer' || decoded.role === 'admin') {
          req.isDev = true;
          return next();
        }
      } catch (jwtErr) {
        if (token === DEV_KEY) {
          req.isDev = true;
          return next();
        }
      }
    }

    return res.status(401).json({ success: false, message: 'Developer authentication required.' });
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired developer session.' });
  }
};

// ── Platform Analytics & Institutions Overview ─────────────────────────────
exports.getPlatformMetrics = async (req, res) => {
  try {
    // 1. Find all tenant admins (institution owners)
    const adminOwners = await User.find({ role: 'admin', createdByAdmin: null })
      .select('name email adminId institutionType institutionName createdAt isActive')
      .sort({ createdAt: -1 })
      .lean();

    // 2. Fetch counts per institution
    const institutionStats = await Promise.all(
      adminOwners.map(async (admin) => {
        const [students, teachers, activeCount] = await Promise.all([
          User.countDocuments({ createdByAdmin: admin._id, role: 'student' }),
          User.countDocuments({ createdByAdmin: admin._id, role: 'teacher' }),
          User.countDocuments({ createdByAdmin: admin._id, isActive: true })
        ]);

        return {
          id: admin._id,
          institutionName: admin.institutionName || admin.name,
          institutionType: admin.institutionType,
          adminName: admin.name,
          adminEmail: admin.email,
          adminId: admin.adminId || 'AD001',
          createdAt: admin.createdAt,
          isActive: admin.isActive,
          studentCount: students,
          teacherCount: teachers,
          activeCount: activeCount + (admin.isActive ? 1 : 0),
          totalUsers: students + teachers + 1
        };
      })
    );

    // 3. Platform-wide totals
    const [totalUsers, totalStudents, totalTeachers, totalActive] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'student' }),
      User.countDocuments({ role: 'teacher' }),
      User.countDocuments({ isActive: true })
    ]);

    return res.json({
      success: true,
      totals: {
        institutions: adminOwners.length,
        students: totalStudents,
        teachers: totalTeachers,
        totalUsers,
        activeUsers: totalActive
      },
      institutions: institutionStats
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── ID & USN Generator Tool ────────────────────────────────────────────────
exports.generateIds = async (req, res) => {
  try {
    const {
      idType, // 'admin' | 'teacher' | 'student'
      instituteCode, // e.g. "MS" (2 chars)
      deptCode, // e.g. "CS" (2 chars)
      year, // e.g. "25" (2 digits)
      startNumber = 1,
      count = 10
    } = req.body;

    if (!['admin', 'teacher', 'student'].includes(idType)) {
      return res.status(400).json({ success: false, message: 'Invalid ID type. Choose admin, teacher, or student.' });
    }

    const inst = String(instituteCode || '').trim().toUpperCase().slice(0, 2);
    if (inst.length < 2) {
      return res.status(400).json({ success: false, message: 'Institute code must be exactly 2 characters (e.g. MS, RI).' });
    }

    const start = Math.max(1, parseInt(startNumber, 10) || 1);
    const totalCount = Math.min(500, Math.max(1, parseInt(count, 10) || 1));

    const generated = [];

    if (idType === 'admin') {
      // Rule: "ad" + 2 char of institute name + unique 3 digit number
      for (let i = 0; i < totalCount; i++) {
        const numStr = String(start + i).padStart(3, '0');
        const id = `AD${inst}${numStr}`;
        generated.push(id);
      }
    } else if (idType === 'teacher') {
      // Rule: "th" + 2 char of institute name + 2 char of dept name (CS, IS etc) + unique 3 digit number
      const dept = String(deptCode || 'CS').trim().toUpperCase().slice(0, 2);
      for (let i = 0; i < totalCount; i++) {
        const numStr = String(start + i).padStart(3, '0');
        const id = `TH${inst}${dept}${numStr}`;
        generated.push(id);
      }
    } else if (idType === 'student') {
      // Rule: 2 char of institute name + registered year (24, 25, 26 etc) + 2 char of dept name (CS, IS etc) + unique 3 digit number
      const regYear = String(year || new Date().getFullYear() % 100).trim().slice(-2);
      const dept = String(deptCode || 'CS').trim().toUpperCase().slice(0, 2);
      for (let i = 0; i < totalCount; i++) {
        const numStr = String(start + i).padStart(3, '0');
        const id = `${inst}${regYear}${dept}${numStr}`;
        generated.push(id);
      }
    }

    // Check collision against database
    const fieldToCheck = idType === 'admin' ? 'adminId' : idType === 'teacher' ? 'teacherId' : 'usn';
    const existing = await User.find({ [fieldToCheck]: { $in: generated } }).select(`${fieldToCheck} name email`).lean();
    const existingMap = new Map(existing.map(u => [u[fieldToCheck], u]));

    const results = generated.map(id => ({
      id,
      available: !existingMap.has(id),
      assignedTo: existingMap.has(id) ? existingMap.get(id).name : null
    }));

    return res.json({
      success: true,
      idType,
      count: results.length,
      availableCount: results.filter(r => r.available).length,
      results
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── Bug & Feedback Management ──────────────────────────────────────────────
exports.getAllBugs = async (req, res) => {
  try {
    const { status, type, severity } = req.query;
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (type && type !== 'all') filter.type = type;
    if (severity && severity !== 'all') filter.severity = severity;

    const bugs = await BugFeedback.find(filter).sort({ createdAt: -1 }).limit(300).lean();

    const counts = {
      total: await BugFeedback.countDocuments(),
      open: await BugFeedback.countDocuments({ status: 'open' }),
      investigating: await BugFeedback.countDocuments({ status: 'investigating' }),
      resolved: await BugFeedback.countDocuments({ status: 'resolved' })
    };

    return res.json({ success: true, counts, bugs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateBugStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, devNotes } = req.body;

    const update = {};
    if (status) update.status = status;
    if (devNotes !== undefined) update.devNotes = devNotes;

    const updated = await BugFeedback.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Bug report not found.' });
    }

    return res.json({ success: true, message: 'Status updated successfully.', bug: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteBug = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await BugFeedback.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Bug report not found.' });
    }
    return res.json({ success: true, message: 'Bug report deleted.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── Register New Institution ────────────────────────────────────────────────
exports.createInstitution = async (req, res) => {
  try {
    const {
      institutionName,
      institutionType = 'institute',
      instituteCode,
      adminId,
      adminName,
      adminEmail,
      adminPassword
    } = req.body;

    if (!institutionName?.trim()) {
      return res.status(400).json({ success: false, message: 'Institution name is required.' });
    }
    if (!adminEmail?.trim() || !adminPassword?.trim()) {
      return res.status(400).json({ success: false, message: 'Admin email and password are required.' });
    }

    const cleanEmail = adminEmail.trim().toLowerCase();
    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
    }

    // Resolve 2-character code
    const code = String(instituteCode || institutionName.replace(/[^a-zA-Z]/g, '').slice(0, 2)).trim().toUpperCase().slice(0, 2);
    if (code.length < 2) {
      return res.status(400).json({ success: false, message: 'Institute 2-character code is required.' });
    }

    // Resolve Admin ID following formula: "AD" + 2 char of institute + "001"
    let resolvedAdminId = adminId ? adminId.trim().toUpperCase() : `AD${code}001`;

    // Ensure Admin ID uniqueness
    let existingAdmin = await User.findOne({ adminId: resolvedAdminId });
    if (existingAdmin) {
      let counter = 2;
      while (existingAdmin) {
        resolvedAdminId = `AD${code}${String(counter).padStart(3, '0')}`;
        existingAdmin = await User.findOne({ adminId: resolvedAdminId });
        counter++;
      }
    }

    const newAdmin = new User({
      name: adminName?.trim() || `${institutionName.trim()} Administration`,
      email: cleanEmail,
      password: adminPassword,
      role: 'admin',
      adminId: resolvedAdminId,
      institutionName: institutionName.trim(),
      institutionType: ['institute', 'school', 'pu_college', 'diploma'].includes(institutionType) ? institutionType : 'institute',
      createdByAdmin: null,
      isActive: true
    });

    await newAdmin.save();

    return res.status(201).json({
      success: true,
      message: `Institution "${institutionName}" registered successfully with Admin ID ${resolvedAdminId}!`,
      institution: {
        id: newAdmin._id,
        institutionName: newAdmin.institutionName,
        institutionType: newAdmin.institutionType,
        adminName: newAdmin.name,
        adminEmail: newAdmin.email,
        adminId: newAdmin.adminId,
        instituteCode: code,
        createdAt: newAdmin.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};


// ── Team Key Management ──────────────────────────────────────────────────────
exports.getDevKeys = async (req, res) => {
  try {
    const keys = await DeveloperKey.find().sort({ createdAt: -1 }).lean();
    return res.json({
      success: true,
      masterKey: DEV_KEY,
      keys
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createDevKey = async (req, res) => {
  try {
    const { label, role = 'developer', customKey } = req.body;
    if (!label?.trim()) {
      return res.status(400).json({ success: false, message: 'Team member name or label is required.' });
    }

    let generatedKey = customKey?.trim();
    if (!generatedKey) {
      const p1 = crypto.randomBytes(3).toString('hex');
      const p2 = crypto.randomBytes(3).toString('hex');
      generatedKey = `metrics-dev-${p1}-${p2}`;
    }

    if (generatedKey === DEV_KEY || await DeveloperKey.findOne({ key: generatedKey })) {
      return res.status(400).json({ success: false, message: 'This developer key already exists. Try generating another.' });
    }

    const newKey = await DeveloperKey.create({
      key: generatedKey,
      label: label.trim(),
      role: ['lead_developer', 'developer', 'qa_engineer'].includes(role) ? role : 'developer',
      createdBy: 'Primary Developer',
      isActive: true
    });

    return res.status(201).json({
      success: true,
      message: `Master key created successfully for ${label}!`,
      key: newKey
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleDevKey = async (req, res) => {
  try {
    const { id } = req.params;
    const keyRecord = await DeveloperKey.findById(id);
    if (!keyRecord) {
      return res.status(404).json({ success: false, message: 'Developer key not found.' });
    }
    keyRecord.isActive = !keyRecord.isActive;
    await keyRecord.save();

    return res.json({
      success: true,
      message: `Key ${keyRecord.isActive ? 'activated' : 'revoked'} successfully.`,
      key: keyRecord
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteDevKey = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await DeveloperKey.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Developer key not found.' });
    }
    return res.json({ success: true, message: 'Developer key deleted permanently.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
