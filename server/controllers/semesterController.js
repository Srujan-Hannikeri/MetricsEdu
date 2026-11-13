const Semester = require('../models/Semester');
const Course   = require('../models/Course');
const User     = require('../models/User');
const Timetable = require('../models/Timetable');
const {
  INSTITUTIONS,
  getInstitutionTypeFilter,
  getTenantAdminId,
  normalizeInstitutionType
} = require('../config/institutions');

const INSTITUTION_CONFIG = Object.fromEntries(
  Object.entries(INSTITUTIONS).map(([type, config]) => [
    type,
    {
      ...config,
      hasBranch: Boolean(config.branches),
      hasSemester: Boolean(config.semesters),
      hasStandard: Boolean(config.standards),
      hasPuc: Boolean(config.pucYears)
    }
  ])
);

function normalizeSubject(code, title) {
  const sectionMatch = String(title).trim().match(/^(.*?)(?:\s*-\s*|\s+)Section\s+([A-F])$/i);
  if (!sectionMatch) return { code: code.trim().toUpperCase(), title: title.trim(), division: '' };
  const division = sectionMatch[2].toUpperCase();
  return {
    code: code.trim().toUpperCase().replace(new RegExp(`[-_ ]?${division}$`), ''),
    title: sectionMatch[1].trim(),
    division
  };
}

exports.getInstitutionConfig = async (req, res) => {
  return res.json({ success: true, config: INSTITUTION_CONFIG });
};

// ─── GET semesters for logged-in admin only ───────────────────────────────────
exports.getSemesters = async (req, res) => {
  try {
    const adminUserId = getTenantAdminId(req.user);
    if (!adminUserId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const { branch, semesterNumber, standard, pucYear, pucDept } = req.query;

    const filter = { adminId: adminUserId };
    if (branch) filter.branch = branch;
    if (semesterNumber) filter.semesterNumber = Number(semesterNumber);
    if (standard) filter.standard = standard;
    if (pucYear) filter.pucYear = pucYear;
    if (pucDept) filter.pucDept = pucDept;

    const sems = await Semester.find(filter)
      .populate('subjects.teacher', 'name teacherId email')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, semesters: sems });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── CREATE semester ──────────────────────────────────────────────────────────
exports.createSemester = async (req, res) => {
  try {
    const adminUserId = getTenantAdminId(req.user);
    if (!adminUserId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const adminUser   = await User.findById(adminUserId);
    if (!adminUser) return res.status(404).json({ success: false, message: 'Admin not found.' });

    const instType = normalizeInstitutionType(adminUser.institutionType);
    const { branch, semesterNumber, standard, pucYear, pucDept,
            startDate, endDate, academicYear } = req.body;

    if (!startDate || !endDate)
      return res.status(400).json({ success: false, message: 'Start date and end date are required.' });
    if (new Date(startDate) >= new Date(endDate))
      return res.status(400).json({ success: false, message: 'Start date must be before end date.' });

    // Validate required fields per institution type
    if (instType === 'institute' || instType === 'diploma') {
      if (!branch)         return res.status(400).json({ success: false, message: 'Branch is required.' });
      if (!semesterNumber) return res.status(400).json({ success: false, message: 'Semester number is required.' });
      if (!INSTITUTIONS[instType].branches.includes(branch) ||
          !INSTITUTIONS[instType].semesters.includes(Number(semesterNumber))) {
        return res.status(400).json({ success: false, message: 'Choose a valid branch and semester.' });
      }
    } else if (instType === 'school') {
      if (!standard) return res.status(400).json({ success: false, message: 'Standard is required.' });
      if (!INSTITUTIONS.school.standards.includes(standard)) {
        return res.status(400).json({ success: false, message: 'Choose a valid school standard.' });
      }
    } else if (instType === 'pu_college') {
      if (!pucYear) return res.status(400).json({ success: false, message: 'PUC year (1st/2nd PUC) is required.' });
      if (!pucDept) return res.status(400).json({ success: false, message: 'PUC department (Science/Arts/Commerce) is required.' });
      if (!INSTITUTIONS.pu_college.pucYears.includes(pucYear) ||
          !INSTITUTIONS.pu_college.pucDepts.includes(pucDept)) {
        return res.status(400).json({ success: false, message: 'Choose a valid PUC year and department.' });
      }
    }

    // Prevent duplicate active configs for same admin
    const dupFilter = { adminId: adminUserId, institutionType: instType, isActive: true };
    if (instType === 'institute' || instType === 'diploma') {
      dupFilter.branch = branch; dupFilter.semesterNumber = Number(semesterNumber);
    } else if (instType === 'school') {
      dupFilter.standard = standard;
    } else if (instType === 'pu_college') {
      dupFilter.pucYear = pucYear; dupFilter.pucDept = pucDept;
    }

    const existing = await Semester.findOne(dupFilter);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `An active semester already exists for this configuration. Deactivate it first before creating a new one.`
      });
    }

    const sem = new Semester({
      institutionType: instType,
      adminId: adminUserId,
      branch: branch || '',
      semesterNumber: semesterNumber ? Number(semesterNumber) : null,
      standard: standard || '',
      pucYear: pucYear || '',
      pucDept: pucDept || '',
      startDate: new Date(startDate),
      endDate:   new Date(endDate),
      academicYear: academicYear || '',
      isActive: true,
      isLocked: false,
      subjects: []
    });
    await sem.save();
    return res.status(201).json({ success: true, message: 'Semester configuration created.', semester: sem });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── UPDATE semester dates / academicYear ─────────────────────────────────────
exports.updateSemester = async (req, res) => {
  try {
    const adminUserId = getTenantAdminId(req.user);
    if (!adminUserId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const sem = await Semester.findOne({ _id: req.params.id, adminId: adminUserId });
    if (!sem) return res.status(404).json({ success: false, message: 'Semester not found or access denied.' });

    if (sem.isLocked)
      return res.status(403).json({ success: false, message: 'Semester is locked. Unlock it first before making changes.' });

    const { startDate, endDate, academicYear, isActive } = req.body;
    if (startDate) sem.startDate = new Date(startDate);
    if (endDate)   sem.endDate   = new Date(endDate);
    if (academicYear !== undefined) sem.academicYear = academicYear;
    if (isActive !== undefined)     sem.isActive = isActive;
    await sem.save();
    return res.json({ success: true, message: 'Semester updated.', semester: sem });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── LOCK semester (admin confirms — locks all editing) ───────────────────────
exports.lockSemester = async (req, res) => {
  try {
    const adminUserId = getTenantAdminId(req.user);
    if (!adminUserId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const sem = await Semester.findOne({ _id: req.params.id, adminId: adminUserId });
    if (!sem) return res.status(404).json({ success: false, message: 'Semester not found.' });
    if (sem.subjects.length === 0)
      return res.status(400).json({ success: false, message: 'Add at least one subject before locking the semester.' });

    sem.isLocked = true;
    sem.lockedAt = new Date();
    await sem.save();
    return res.json({ success: true, message: 'Semester locked. No further edits allowed until unlocked by admin.', semester: sem });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── UNLOCK semester ──────────────────────────────────────────────────────────
exports.unlockSemester = async (req, res) => {
  try {
    const adminUserId = getTenantAdminId(req.user);
    if (!adminUserId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const sem = await Semester.findOne({ _id: req.params.id, adminId: adminUserId });
    if (!sem) return res.status(404).json({ success: false, message: 'Semester not found.' });
    sem.isLocked = false;
    sem.lockedAt = null;
    await sem.save();
    return res.json({ success: true, message: 'Semester unlocked. Editing is now enabled.', semester: sem });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE semester ──────────────────────────────────────────────────────────
exports.deleteSemester = async (req, res) => {
  try {
    const adminUserId = getTenantAdminId(req.user);
    if (!adminUserId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const sem = await Semester.findOne({ _id: req.params.id, adminId: adminUserId });
    if (!sem) return res.status(404).json({ success: false, message: 'Semester not found or access denied.' });
    if (sem.isLocked)
      return res.status(403).json({ success: false, message: 'Unlock the semester before deleting it.' });
    await Semester.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Semester configuration deleted.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── ADD / UPDATE subjects ────────────────────────────────────────────────────
exports.addSubjects = async (req, res) => {
  try {
    const adminUserId = getTenantAdminId(req.user);
    if (!adminUserId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const { subjects } = req.body;
    if (!subjects || !Array.isArray(subjects) || subjects.length === 0)
      return res.status(400).json({ success: false, message: 'Subjects array is required.' });

    const sem = await Semester.findOne({ _id: req.params.id, adminId: adminUserId });
    if (!sem) return res.status(404).json({ success: false, message: 'Semester not found or access denied.' });
    if (sem.isLocked)
      return res.status(403).json({ success: false, message: 'Semester is locked. Unlock it to edit subjects.' });

    for (const sub of subjects) {
      if (!sub.code || !sub.title) continue;
      const normalized = normalizeSubject(sub.code, sub.title);
      const division = String(sub.division || normalized.division).toUpperCase();

      // 1-teacher-1-subject per semester
      if (sub.teacherId) {
        const teacher = await User.findOne({
          _id: sub.teacherId,
          role: 'teacher',
          createdByAdmin: adminUserId,
          institutionType: getInstitutionTypeFilter(sem.institutionType)
        });
        if (!teacher) {
          return res.status(400).json({ success: false, message: 'Choose a teacher from this institution.' });
        }
        if (((sem.institutionType === 'institute' || sem.institutionType === 'diploma') &&
              (teacher.branch || teacher.department) !== sem.branch) ||
            (sem.institutionType === 'pu_college' &&
              (teacher.pucDept !== sem.pucDept || (teacher.pucYear && teacher.pucYear !== sem.pucYear)))) {
          return res.status(400).json({ success: false, message: 'Choose a teacher from this department and cohort.' });
        }

        const conflict = sem.subjects.find(s =>
          s.teacher && s.teacher.toString() === sub.teacherId.toString() &&
          String(s.division || normalizeSubject(s.code, s.title).division).toUpperCase() === division &&
          normalizeSubject(s.code, s.title).code !== normalized.code
        );
        if (conflict)
          return res.status(400).json({
            success: false,
            message: `Teacher is already assigned to "${conflict.title}" in Division ${division || '—'}. One teacher can handle only one subject per semester in each division.`
          });
      }

      const exists = sem.subjects.find(s =>
        normalizeSubject(s.code, s.title).code === normalized.code &&
        String(s.division || normalizeSubject(s.code, s.title).division).toUpperCase() === division
      );
      if (exists) {
        exists.code = normalized.code;
        exists.title = normalized.title;
        exists.division = division;
        exists.weeklyHours = sub.weeklyHours || exists.weeklyHours;
        if (Number.isFinite(Number(sub.semesterHours)) && Number(sub.semesterHours) > 0) {
          exists.semesterHours = Number(sub.semesterHours);
        }
        if (sub.replaceTeacher) exists.teacher = sub.teacherId || null;
        else if (sub.teacherId) exists.teacher = sub.teacherId;
      } else {
        sem.subjects.push({
          code: normalized.code,
          title: normalized.title,
          division,
          weeklyHours: sub.weeklyHours || 4,
          semesterHours: Number.isFinite(Number(sub.semesterHours)) && Number(sub.semesterHours) > 0
            ? Number(sub.semesterHours)
            : null,
          teacher: sub.teacherId || null
        });
      }
    }
    const uniqueSubjects = new Map();
    for (const subject of sem.subjects) {
      const identity = normalizeSubject(subject.code, subject.title);
      const division = String(subject.division || identity.division).toUpperCase();
      const key = `${identity.code}:${division}`;
      const existing = uniqueSubjects.get(key);
      if (existing) {
        if (!existing.teacher && subject.teacher) existing.teacher = subject.teacher;
        if (!existing.semesterHours && subject.semesterHours) existing.semesterHours = subject.semesterHours;
        if (!existing.weeklyHours && subject.weeklyHours) existing.weeklyHours = subject.weeklyHours;
      } else {
        subject.code = identity.code;
        subject.title = identity.title;
        subject.division = division;
        uniqueSubjects.set(key, subject);
      }
    }
    sem.subjects = Array.from(uniqueSubjects.values());
    await sem.save();
    const populated = await Semester.findById(sem._id).populate('subjects.teacher', 'name teacherId email');
    return res.json({ success: true, message: 'Subjects updated.', semester: populated });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── REMOVE subject ───────────────────────────────────────────────────────────
exports.removeSubject = async (req, res) => {
  try {
    const adminUserId = getTenantAdminId(req.user);
    if (!adminUserId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const sem = await Semester.findOne({ _id: req.params.id, adminId: adminUserId });
    if (!sem) return res.status(404).json({ success: false, message: 'Semester not found.' });
    if (sem.isLocked)
      return res.status(403).json({ success: false, message: 'Semester is locked. Unlock to remove subjects.' });
    const targetCode = req.params.subjectCode.toUpperCase();
    const targetDivision = String(req.query.division || '').toUpperCase();
    sem.subjects = sem.subjects.filter(s => {
      const identity = normalizeSubject(s.code, s.title);
      const subjectDivision = String(s.division || identity.division).toUpperCase();
      return identity.code !== targetCode ||
        (targetDivision && subjectDivision && subjectDivision !== targetDivision);
    });
    await sem.save();
    return res.json({ success: true, message: 'Subject removed.', semester: sem });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
