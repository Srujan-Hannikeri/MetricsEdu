const jwt = require('jsonwebtoken');
const User = require('../models/User');
const BugFeedback = require('../models/BugFeedback');

const DEV_KEY = process.env.DEV_ACCESS_KEY || 'metrics-dev-2026';
const JWT_SECRET = process.env.JWT_SECRET || 'metricsedu_secret_key_2026';

// ── Developer Authentication ────────────────────────────────────────────────
exports.authenticateDev = async (req, res) => {
  try {
    const { accessKey } = req.body;
    if (!accessKey || accessKey.trim() !== DEV_KEY) {
      return res.status(401).json({ success: false, message: 'Invalid developer access key.' });
    }

    const token = jwt.sign(
      { role: 'developer', name: 'MetricsEdu Core Team' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      message: 'Developer access granted. Welcome to MetricsEdu Core Console.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ── Middleware for dev route authorization ──────────────────────────────────
exports.requireDevAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const devHeader = req.headers['x-dev-key'];

    if (devHeader && devHeader.trim() === DEV_KEY) {
      req.isDev = true;
      return next();
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Developer authentication required.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'developer') {
      return res.status(403).json({ success: false, message: 'Access forbidden: developer clearance required.' });
    }

    req.isDev = true;
    next();
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
