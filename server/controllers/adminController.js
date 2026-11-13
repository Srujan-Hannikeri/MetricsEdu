const User = require('../models/User');
const AttendanceSession = require('../models/AttendanceSession');
const Course = require('../models/Course');
const Timetable = require('../models/Timetable');
const Semester = require('../models/Semester');
const {
  getInstitutionTypeFilter,
  getStudentCohortFilter,
  getTenantAdminId,
  isSameInstitution,
  normalizeInstitutionType
} = require('../config/institutions');

const SCHEDULE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function normalizeCourseIdentity(code, title) {
  const sectionMatch = String(title || '').trim().match(/^(.*?)(?:\s*-\s*|\s+)Section\s+([A-F])$/i);
  if (!sectionMatch) return { code: String(code || '').trim().toUpperCase(), title: String(title || '').trim(), division: '' };
  const division = sectionMatch[2].toUpperCase();
  return {
    code: String(code || '').trim().toUpperCase().replace(new RegExp(`[-_ ]?${division}$`), ''),
    title: sectionMatch[1].trim(),
    division
  };
}

function getSemesterWeeks(semester) {
  if (!semester) return 16;
  const start = new Date(semester?.startDate);
  const end = new Date(semester?.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    throw new Error('The semester needs valid start and end dates before course hours can be scheduled.');
  }
  return Math.max(1, Math.ceil((end.getTime() - start.getTime() + 86400000) / (7 * 86400000)));
}

function getDailyHourTargets(weeklyHours, dayOffset = 0) {
  const total = Math.max(0, Math.round(weeklyHours));
  const base = Math.floor(total / SCHEDULE_DAYS.length);
  const extra = total % SCHEDULE_DAYS.length;
  const targets = SCHEDULE_DAYS.map((_, index) =>
    base + (Math.round((index + 1) * extra / SCHEDULE_DAYS.length) >
      Math.round(index * extra / SCHEDULE_DAYS.length) ? 1 : 0)
  );
  return SCHEDULE_DAYS.map((_, index) =>
    targets[(index - dayOffset + SCHEDULE_DAYS.length) % SCHEDULE_DAYS.length]
  );
}

// ─── System-wide statistics — scoped to admin's own institution ──────────────
exports.getAdminStats = async (req, res) => {
  try {
    const adminUser = await User.findById(req.user._id);
    const instType = adminUser?.institutionType || 'institute';
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const typeFilter = getInstitutionTypeFilter(instType);

    const tenantUsers = { createdByAdmin: tenantAdminId, institutionType: typeFilter };
    const [totalStudents, totalTeachers, totalAdmins, studentsWithFace, courseIds] = await Promise.all([
      User.countDocuments({ ...tenantUsers, role: 'student' }),
      User.countDocuments({ ...tenantUsers, role: 'teacher' }),
      User.countDocuments({
        role: 'admin',
        institutionType: typeFilter,
        $or: [{ _id: tenantAdminId }, { createdByAdmin: tenantAdminId }]
      }),
      User.countDocuments({ ...tenantUsers, role: 'student', faceRegistered: true }),
      Course.find({ createdByAdmin: tenantAdminId }).distinct('_id')
    ]);
    const sessionFilter = { course: { $in: courseIds } };
    const totalCourses  = courseIds.length;
    const [totalSessions, totalTimetableSlots, attendanceStats, recentSessions] = await Promise.all([
      AttendanceSession.countDocuments(sessionFilter),
      Timetable.countDocuments({ course: { $in: courseIds }, institutionType: typeFilter }),
      AttendanceSession.aggregate([
        { $match: sessionFilter },
        { $group: { _id: null, average: { $avg: '$attendancePercentage' } } }
      ]),
      AttendanceSession.find(sessionFilter)
        .select('course teacher sessionDate timeSlot attendancePercentage totalPresent totalEnrolled totalAbsent classPhoto teacherPhoto')
        .populate('course', 'code title')
        .populate('teacher', 'name')
        .sort({ sessionDate: -1 })
        .limit(15)
        .lean()
    ]);
    const avgAttendance = Math.round(attendanceStats[0]?.average || 0);

    res.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=60');
    return res.json({
      success: true,
      stats: {
        totalStudents, totalTeachers, totalAdmins, studentsWithFace,
        faceRegistrationRate: totalStudents > 0 ? Math.round((studentsWithFace / totalStudents) * 100) : 0,
        totalCourses, totalSessions, totalTimetableSlots, avgAttendance, recentSessions
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════
//  TIME HELPERS
// ═══════════════════════════════════════════════════════════════════

function parseTimeToMinutes(t) {
  if (!t) return 0;
  let str = t.trim().toLowerCase();
  const isPM = str.includes('pm');
  const isAM = str.includes('am');
  str = str.replace(/[ap]m/g, '').trim();
  const parts = str.split(':');
  let h = parseInt(parts[0], 10) || 0;
  let m = parseInt(parts[1], 10) || 0;
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  if (!isPM && !isAM && h >= 1 && h <= 6) h += 12;
  return h * 60 + m;
}

function parseSlotTimes(slotStr) {
  if (!slotStr) return null;
  const parts = slotStr.split(/\s*(?:-|–|—|to)\s*/i);
  if (parts.length < 2) return null;
  const start = parseTimeToMinutes(parts[0]);
  const end = parseTimeToMinutes(parts[1]);
  if (end <= start) return null;
  return { start, end, rawStart: parts[0].trim(), rawEnd: parts[1].trim() };
}

function getTimetableSlotTimes(slot) {
  if (slot.startMinutes > 0 && slot.endMinutes > slot.startMinutes) {
    return { start: slot.startMinutes, end: slot.endMinutes };
  }
  const parsed = parseSlotTimes(slot.timeSlot);
  return parsed ? { start: parsed.start, end: parsed.end } : null;
}

function checkTeacherBreakViolation(newSlotStr, existingSlots, teacherName) {
  const newTimes = parseSlotTimes(newSlotStr);
  if (!newTimes) return null;

  for (const s of existingSlots) {
    const sTimes = parseSlotTimes(s.timeSlot);
    if (!sTimes) continue;

    if (newTimes.start < sTimes.end && newTimes.end > sTimes.start) {
      return `Overlap: ${teacherName} is already teaching during ${s.timeSlot} on ${s.day} (Div ${s.division}).`;
    }
    const gapAfter = newTimes.start - sTimes.end;
    if (gapAfter >= 0 && gapAfter < 15) {
      return `Break Constraint: ${teacherName} needs ≥15 min break after class ending at ${sTimes.rawEnd} on ${s.day} (gap: ${gapAfter} min).`;
    }
    const gapBefore = sTimes.start - newTimes.end;
    if (gapBefore >= 0 && gapBefore < 15) {
      return `Break Constraint: ${teacherName} needs ≥15 min break before class at ${sTimes.rawStart} on ${s.day} (gap: ${gapBefore} min).`;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
//  TIMETABLE CRUD
// ═══════════════════════════════════════════════════════════════════

exports.getTimetables = async (req, res) => {
  try {
    const { division, day, semester, branch, standard, institutionType, pucYear, pucDept } = req.query;
    const actorType = normalizeInstitutionType(req.user.institutionType || 'institute');
    const filter = { institutionType: getInstitutionTypeFilter(actorType) };

    if (institutionType && normalizeInstitutionType(institutionType) !== actorType) {
      return res.status(403).json({ success: false, message: 'Timetables are restricted to your institution.' });
    }
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }
    const tenantCourseIds = await Course.find({ createdByAdmin: tenantAdminId }).distinct('_id');
    filter.course = { $in: tenantCourseIds };
    if (req.user.role === 'teacher') filter.teacher = req.user._id;

    if (division) filter.division = division.toUpperCase();
    if (day) filter.day = day;
    if (req.user.role === 'student') {
      Object.assign(filter, getStudentCohortFilter(req.user));
      filter.division = (req.user.division || req.user.section || division || 'A').toUpperCase();
    } else {
      if (semester) filter.semester = Number(semester);
      if (branch) filter.branch = branch;
      if (standard) filter.standard = standard;
      if (actorType === 'pu_college') {
        if (req.user.role === 'admin') {
          if (pucYear) filter.pucYear = pucYear;
          if (pucDept) filter.pucDept = pucDept;
        } else {
          filter.pucDept = req.user.pucDept;
          if (req.user.pucYear) filter.pucYear = req.user.pucYear;
        }
      } else if (actorType === 'school' && req.user.role === 'teacher' && req.user.standard) {
        filter.standard = req.user.standard;
      } else if (req.user.role === 'teacher' && (actorType === 'institute' || actorType === 'diploma')) {
        const teacherBranch = req.user.branch || req.user.department;
        if (branch && branch !== teacherBranch) {
          return res.status(403).json({ success: false, message: 'Timetables are restricted to your department.' });
        }
        filter.branch = teacherBranch;
      }
    }

    const slots = await Timetable.find(filter)
      .populate('course', 'code title department branch')
      .populate('teacher', 'name teacherId email')
      .sort({ day: 1, timeSlot: 1 })
      .lean();

    res.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=60');
    return res.json({ success: true, slots });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createTimetableEntry = async (req, res) => {
  try {
    const { day, timeSlot, courseId, teacherId, division, classroom, semester, branch,
      standard, pucYear, pucDept } = req.body;
    const effectiveInstitutionType = normalizeInstitutionType(req.user.institutionType || 'institute');
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }

    if (!day || !timeSlot || !courseId || !teacherId)
      return res.status(400).json({ success: false, message: 'Day, timeSlot, course, and teacher are required.' });

    const [course, teacher] = await Promise.all([
      Course.findOne({ _id: courseId, createdByAdmin: tenantAdminId }),
      User.findOne({
        _id: teacherId,
        role: 'teacher',
        createdByAdmin: tenantAdminId,
        institutionType: getInstitutionTypeFilter(effectiveInstitutionType)
      })
    ]);
    if (!course || !teacher || !isSameInstitution(course, req.user) || !isSameInstitution(teacher, req.user)) {
      return res.status(400).json({ success: false, message: 'Choose a course and teacher from your institution.' });
    }
    if (course.teacher && course.teacher.toString() !== teacher._id.toString()) {
      return res.status(400).json({ success: false, message: 'The selected teacher is not assigned to this course.' });
    }
    if ((effectiveInstitutionType === 'institute' || effectiveInstitutionType === 'diploma') &&
        semester && Number(semester) !== Number(course.semester)) {
      return res.status(400).json({ success: false, message: 'The selected semester does not match the course.' });
    }

    const trimmedSlot = timeSlot.trim();
    const trimmedRoom = (classroom || 'Smart Lecture Hall LH-301').trim();
    const targetDiv = division ? division.toUpperCase() : 'A';
    const targetSem = course.semester;
    const targetBranch = course.branch || course.department || branch || '';
    const targetStandard = course.standard || standard || '';
    const targetPucYear = course.pucYear || pucYear || '';
    const targetPucDept = course.pucDept || teacher.pucDept || pucDept || '';
    const tenantCourseIds = await Course.find({ createdByAdmin: tenantAdminId }).distinct('_id');
    if (((effectiveInstitutionType === 'institute' || effectiveInstitutionType === 'diploma') &&
          (teacher.branch || teacher.department) !== targetBranch) ||
        (effectiveInstitutionType === 'pu_college' && teacher.pucDept !== targetPucDept)) {
      return res.status(400).json({ success: false, message: 'The selected teacher does not belong to this department.' });
    }
    if ((branch && targetBranch && branch !== targetBranch) ||
        (standard && targetStandard && standard !== targetStandard) ||
        (pucYear && targetPucYear && pucYear !== targetPucYear) ||
        (pucDept && targetPucDept && pucDept !== targetPucDept)) {
      return res.status(400).json({ success: false, message: 'The timetable cohort does not match the selected course.' });
    }

    // 1. Same division/semester clash
    const classConflict = await Timetable.findOne({
      day, timeSlot: trimmedSlot, division: targetDiv, semester: targetSem,
      branch: targetBranch, standard: targetStandard, pucYear: targetPucYear, pucDept: targetPucDept,
      institutionType: getInstitutionTypeFilter(effectiveInstitutionType),
      course: { $in: tenantCourseIds }
    }).populate('course', 'code title');
    if (classConflict && classConflict.course && classConflict.course._id.toString() !== courseId) {
      return res.status(400).json({
        success: false,
        message: `Conflict: Division ${targetDiv} already has "${classConflict.course.code}" on ${day} at ${trimmedSlot}.`
      });
    }

    // 2. Teacher break rule
    const teacherDaySlots = await Timetable.find({
      day, teacher: teacherId, institutionType: getInstitutionTypeFilter(effectiveInstitutionType)
    });
    const breakError = checkTeacherBreakViolation(trimmedSlot, teacherDaySlots, teacher.name || 'Teacher');
    if (breakError) return res.status(400).json({ success: false, message: breakError });

    // 3. Classroom clash
    const roomConflict = await Timetable.findOne({
      day, timeSlot: trimmedSlot, classroom: trimmedRoom,
      institutionType: getInstitutionTypeFilter(effectiveInstitutionType),
      course: { $in: tenantCourseIds }
    });
    if (roomConflict && (roomConflict.division !== targetDiv || roomConflict.semester !== targetSem)) {
      return res.status(400).json({
        success: false,
        message: `Classroom "${trimmedRoom}" is already occupied on ${day} at ${trimmedSlot} by Division ${roomConflict.division}.`
      });
    }

    const slotTimes = parseSlotTimes(trimmedSlot) || { start: 0, end: 0 };
    const newSlot = new Timetable({
      day, timeSlot: trimmedSlot, course: courseId, teacher: teacherId,
      division: targetDiv, classroom: trimmedRoom, semester: targetSem,
      branch: targetBranch,
      startMinutes: slotTimes.start, endMinutes: slotTimes.end,
      institutionType: effectiveInstitutionType,
      standard: targetStandard,
      pucYear: targetPucYear,
      pucDept: targetPucDept
    });
    await newSlot.save();
    const populated = await Timetable.findById(newSlot._id)
      .populate('course', 'code title department branch')
      .populate('teacher', 'name teacherId email');
    return res.status(201).json({ success: true, message: 'Timetable entry added.', slot: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateTimetableEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const actorType = normalizeInstitutionType(req.user.institutionType || 'institute');
    const institutionFilter = getInstitutionTypeFilter(actorType);
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }
    const existing = await Timetable.findOne({ _id: id, institutionType: institutionFilter });
    if (!existing) return res.status(404).json({ success: false, message: 'Entry not found.' });
    if (!(await Course.exists({ _id: existing.course, createdByAdmin: tenantAdminId }))) {
      return res.status(404).json({ success: false, message: 'Entry not found.' });
    }

    const targetDay = req.body.day || existing.day;
    const targetSlot = (req.body.timeSlot || existing.timeSlot).trim();
    const targetCourse = req.body.courseId || req.body.course || existing.course;
    const targetTeacher = req.body.teacherId || req.body.teacher || existing.teacher;
    const targetRoom = (req.body.classroom || existing.classroom).trim();
    const targetDiv = (req.body.division || existing.division).toUpperCase();
    const [course, teacher] = await Promise.all([
      Course.findOne({ _id: targetCourse, createdByAdmin: tenantAdminId }),
      User.findOne({
        _id: targetTeacher,
        role: 'teacher',
        createdByAdmin: tenantAdminId,
        institutionType: institutionFilter
      })
    ]);
    if (!course || !teacher || !isSameInstitution(course, req.user) || !isSameInstitution(teacher, req.user)) {
      return res.status(400).json({ success: false, message: 'Choose a course and teacher from your institution.' });
    }
    if (course.teacher && course.teacher.toString() !== teacher._id.toString()) {
      return res.status(400).json({ success: false, message: 'The selected teacher is not assigned to this course.' });
    }
    if ((actorType === 'institute' || actorType === 'diploma') &&
        req.body.semester && Number(req.body.semester) !== Number(course.semester)) {
      return res.status(400).json({ success: false, message: 'The selected semester does not match the course.' });
    }
    const targetSem = course.semester;
    const targetBranch = course.branch || course.department || '';
    const targetStandard = course.standard || '';
    const targetPucYear = course.pucYear || '';
    const targetPucDept = course.pucDept || teacher.pucDept || '';
    const tenantCourseIds = await Course.find({ createdByAdmin: tenantAdminId }).distinct('_id');
    if (((actorType === 'institute' || actorType === 'diploma') &&
          (teacher.branch || teacher.department) !== targetBranch) ||
        (actorType === 'pu_college' && teacher.pucDept !== targetPucDept)) {
      return res.status(400).json({ success: false, message: 'The selected teacher does not belong to this department.' });
    }
    if ((req.body.branch && req.body.branch !== targetBranch) ||
        (req.body.standard && req.body.standard !== targetStandard) ||
        (req.body.pucYear && req.body.pucYear !== targetPucYear) ||
        (req.body.pucDept && req.body.pucDept !== targetPucDept)) {
      return res.status(400).json({ success: false, message: 'The timetable cohort does not match the selected course.' });
    }

    if (targetCourse) {
      const classConflict = await Timetable.findOne({
        _id: { $ne: id }, day: targetDay, timeSlot: targetSlot,
        division: targetDiv, semester: targetSem, branch: targetBranch,
        standard: targetStandard, pucYear: targetPucYear, pucDept: targetPucDept,
        institutionType: institutionFilter,
        course: { $in: tenantCourseIds }
      }).populate('course', 'code title');
      if (classConflict && classConflict.course && classConflict.course._id.toString() !== targetCourse.toString()) {
        return res.status(400).json({
          success: false,
          message: `Conflict: Division ${targetDiv} already has "${classConflict.course.code}" on ${targetDay} at ${targetSlot}.`
        });
      }
    }

    if (targetTeacher) {
      const teacherDaySlots = await Timetable.find({
        _id: { $ne: id }, day: targetDay, teacher: targetTeacher, institutionType: institutionFilter
      });
      const breakError = checkTeacherBreakViolation(targetSlot, teacherDaySlots, teacher.name || 'Teacher');
      if (breakError) return res.status(400).json({ success: false, message: breakError });
    }

    if (targetRoom) {
      const roomConflict = await Timetable.findOne({
        _id: { $ne: id }, day: targetDay, timeSlot: targetSlot, classroom: targetRoom,
        institutionType: institutionFilter,
        course: { $in: tenantCourseIds }
      });
      if (roomConflict && roomConflict.division !== targetDiv) {
        return res.status(400).json({
          success: false,
          message: `Classroom "${targetRoom}" is already booked by Division ${roomConflict.division} on ${targetDay} at ${targetSlot}.`
        });
      }
    }

    const slotTimes = parseSlotTimes(targetSlot) || { start: 0, end: 0 };
    const updateData = {
      ...req.body,
      course: targetCourse,
      teacher: targetTeacher,
      branch: targetBranch,
      semester: targetSem,
      standard: targetStandard,
      pucYear: targetPucYear,
      pucDept: targetPucDept,
      institutionType: actorType,
      startMinutes: slotTimes.start,
      endMinutes: slotTimes.end
    };
    const updated = await Timetable.findOneAndUpdate(
      { _id: id, institutionType: institutionFilter },
      { $set: updateData },
      { new: true }
    )
      .populate('course', 'code title department branch')
      .populate('teacher', 'name teacherId email');
    return res.json({ success: true, message: 'Timetable entry updated.', slot: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteTimetableEntry = async (req, res) => {
  try {
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }
    const tenantCourseIds = await Course.find({ createdByAdmin: tenantAdminId }).distinct('_id');
    await Timetable.findOneAndDelete({
      _id: req.params.id,
      institutionType: getInstitutionTypeFilter(normalizeInstitutionType(req.user.institutionType || 'institute')),
      course: { $in: tenantCourseIds }
    });
    return res.json({ success: true, message: 'Timetable entry deleted.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════
//  ADVANCED SCHEDULING ALGORITHM (Constraint-Based)
//
//  Constraints enforced:
//  1. A teacher cannot teach 2 subjects in the same semester (1 subject per teacher per semester)
//  2. A teacher cannot be scheduled in 2 classes at the same time
//  3. A teacher must have ≥15 min break between consecutive classes on the same day
//  4. A division cannot have 2 subjects at the same time slot
//  5. Classroom double-booking prevention
//  6. Max 2 consecutive periods before a break for a teacher
//  7. Saturday has limited slots (no afternoon)
//  8. Generates independently for each requested division
// ═══════════════════════════════════════════════════════════════════

exports.autoGenerateTimetable = async (req, res) => {
  try {
    const {
      divisions, division, semester, branch, institutionType, standard,
      pucYear, pucDept, semesterId, classrooms
    } = req.body;

    // Accept either a single division or an array of divisions
    const targetDivs = divisions
      ? (Array.isArray(divisions) ? divisions.map(d => d.toUpperCase()) : [divisions.toUpperCase()])
      : [(division || 'A').toUpperCase()];

    const instType = normalizeInstitutionType(req.user.institutionType || 'institute');
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }
    if (institutionType && normalizeInstitutionType(institutionType) !== instType) {
      return res.status(403).json({ success: false, message: 'Timetables are restricted to your institution.' });
    }

    const semDoc = semesterId
      ? await Semester.findOne({
          _id: semesterId,
          adminId: tenantAdminId,
          institutionType: getInstitutionTypeFilter(instType)
        }).populate('subjects.teacher')
      : null;
    if (semesterId && !semDoc) {
      return res.status(404).json({ success: false, message: 'Semester configuration not found for your institution.' });
    }

    const targetBranch = branch || semDoc?.branch || '';
    const targetStandard = standard || semDoc?.standard || '';
    const targetPucYear = pucYear || semDoc?.pucYear || '';
    const targetPucDept = pucDept || semDoc?.pucDept || '';
    const targetSem = Number(semester) || semDoc?.semesterNumber ||
      (instType === 'school' ? Math.max(1, Number(targetStandard.match(/^\d+/)?.[0]) || 1) :
        instType === 'pu_college' ? (targetPucYear === '2nd PUC' ? 2 : 1) : 5);

    if (semDoc && (
      (semDoc.branch && semDoc.branch !== targetBranch) ||
      (semDoc.standard && semDoc.standard !== targetStandard) ||
      (semDoc.pucYear && semDoc.pucYear !== targetPucYear) ||
      (semDoc.pucDept && semDoc.pucDept !== targetPucDept) ||
      (semDoc.semesterNumber && semDoc.semesterNumber !== targetSem)
    )) {
      return res.status(400).json({ success: false, message: 'The selected semester does not match the requested cohort.' });
    }

    // ── Load subjects for this semester ──────────────────────────────────────
    // Priority: use Semester document subjects if semesterId given, else fall back to Courses
    let subjectsWithTeachers = [];

    if (semDoc) {
      if (semDoc.subjects.length > 0) {
        const semesterWeeks = getSemesterWeeks(semDoc);
        for (const div of targetDivs) {
          const divisionSubjects = semDoc.subjects.filter(subject => {
            const identity = normalizeCourseIdentity(subject.code, subject.title);
            return String(subject.division || identity.division).toUpperCase() === div;
          });
          const sourceSubjects = divisionSubjects.length
            ? divisionSubjects
            : semDoc.subjects.filter(subject => {
                const identity = normalizeCourseIdentity(subject.code, subject.title);
                return !String(subject.division || identity.division).trim();
              });
          const uniqueSubjects = new Map();
          sourceSubjects.filter(subject => subject.teacher).forEach(subject => {
            const identity = normalizeCourseIdentity(subject.code, subject.title);
            if (uniqueSubjects.has(identity.code)) return;
            const semesterHours = Number(subject.semesterHours) || null;
            const weeklyHours = semesterHours
              ? semesterHours / semesterWeeks
              : Number(subject.weeklyHours) || 4;
            uniqueSubjects.set(identity.code, {
              subjectCode: identity.code,
              subjectTitle: identity.title,
              semesterHours,
              weeklyHours,
              division: div,
              dailyHourTargets: getDailyHourTargets(weeklyHours, uniqueSubjects.size),
              teacher: subject.teacher,
              courseId: null
            });
          });
          subjectsWithTeachers.push(...uniqueSubjects.values());
        }

        // Try to map to existing Course documents
        for (const sub of subjectsWithTeachers) {
          const course = await Course.findOne({
            code: sub.subjectCode,
            createdByAdmin: tenantAdminId,
            institutionType: getInstitutionTypeFilter(instType),
            branch: targetBranch,
            standard: targetStandard,
            pucYear: targetPucYear,
            pucDept: targetPucDept,
            semester: targetSem,
            section: sub.division
          });
          if (course) {
            course.code = sub.subjectCode;
            course.title = sub.subjectTitle;
            course.teacher = sub.teacher._id;
            course.semesterHours = sub.semesterHours;
            course.section = sub.division;
            await course.save();
            sub.courseId = course._id;
          }
          else {
            const newCourse = new Course({
              code: sub.subjectCode,
              title: sub.subjectTitle,
              department: targetBranch,
              branch: targetBranch,
              semester: targetSem,
              teacher: sub.teacher._id,
              semesterHours: sub.semesterHours,
              section: sub.division,
              institutionType: instType,
              standard: targetStandard,
              pucYear: targetPucYear,
              pucDept: targetPucDept,
              createdByAdmin: tenantAdminId,
              semesterRef: semDoc._id
            });
            await newCourse.save();
            sub.courseId = newCourse._id;
          }
        }
      }
    }

    // Fallback: load from Course model
    if (subjectsWithTeachers.length === 0) {
      const query = {
        semester: targetSem,
        institutionType: getInstitutionTypeFilter(instType),
        createdByAdmin: tenantAdminId,
        branch: targetBranch,
        standard: targetStandard,
        pucYear: targetPucYear,
        pucDept: targetPucDept
      };

      const courses = await Course.find(query).populate('teacher');
      for (const div of targetDivs) {
        const divisionCourses = courses.filter(course => {
          const identity = normalizeCourseIdentity(course.code, course.title);
          return String(course.section || identity.division).toUpperCase() === div;
        });
        const sourceCourses = divisionCourses.length ? divisionCourses : courses.filter(course => {
          const identity = normalizeCourseIdentity(course.code, course.title);
          return !String(course.section || identity.division).trim();
        });
        const uniqueSubjects = new Map();
        sourceCourses.filter(course => course.teacher).forEach(course => {
          const identity = normalizeCourseIdentity(course.code, course.title);
          if (uniqueSubjects.has(identity.code)) return;
          const semesterHours = Number(course.semesterHours) || null;
          const weeklyHours = semesterHours && semDoc
            ? semesterHours / getSemesterWeeks(semDoc)
            : 4;
          uniqueSubjects.set(identity.code, {
            subjectCode: identity.code,
            subjectTitle: identity.title,
            semesterHours,
            weeklyHours,
            division: div,
            dailyHourTargets: getDailyHourTargets(weeklyHours, uniqueSubjects.size),
            teacher: course.teacher,
            courseId: course._id
          });
        });
        subjectsWithTeachers.push(...uniqueSubjects.values());
      }
    }

    if (subjectsWithTeachers.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No subjects with assigned teachers found for ${targetBranch} Semester ${targetSem}. Please add subjects and assign teachers first.`
      });
    }
    const divisionsWithoutAssignments = targetDivs.filter(div =>
      !subjectsWithTeachers.some(subject => subject.division === div)
    );
    if (divisionsWithoutAssignments.length) {
      return res.status(400).json({
        success: false,
        message: `Assign at least one subject teacher for Division(s) ${divisionsWithoutAssignments.join(', ')} before generating the timetable.`
      });
    }

    for (const subject of subjectsWithTeachers) {
      const teacher = subject.teacher;
      const teacherBranch = teacher.branch || teacher.department;
      if (teacher.createdByAdmin?.toString() !== tenantAdminId.toString() ||
          !isSameInstitution(teacher, req.user) ||
          ((instType === 'institute' || instType === 'diploma') && teacherBranch !== targetBranch) ||
          (instType === 'pu_college' &&
            (teacher.pucDept !== targetPucDept || (teacher.pucYear && teacher.pucYear !== targetPucYear)))) {
        return res.status(400).json({
          success: false,
          message: `Teacher assigned to ${subject.subjectCode} does not belong to the selected institution and department.`
        });
      }
    }

    // ── Enforce: 1 teacher → 1 subject per semester ──────────────────────────
    const teacherSubjectMap = {};
    for (const sub of subjectsWithTeachers) {
      const tid = sub.teacher._id.toString();
      const teacherDivisionKey = `${sub.division}:${tid}`;
      if (teacherSubjectMap[teacherDivisionKey]) {
        return res.status(400).json({
          success: false,
          message: `Teacher constraint violated: "${sub.teacher.name}" is assigned to both "${teacherSubjectMap[teacherDivisionKey].subjectTitle}" and "${sub.subjectTitle}" in Division ${sub.division}.`
        });
      }
      teacherSubjectMap[teacherDivisionKey] = sub;
    }

    // ── Time slots & days setup ───────────────────────────────────────────────
    const days = SCHEDULE_DAYS;
    const timeSlots = [
      { slot: '08:30 AM - 09:25 AM', start: parseTimeToMinutes('08:30 AM'), end: parseTimeToMinutes('09:25 AM') },
      { slot: '09:25 AM - 10:20 AM', start: parseTimeToMinutes('09:25 AM'), end: parseTimeToMinutes('10:20 AM') },
      { slot: '10:50 AM - 11:45 AM', start: parseTimeToMinutes('10:50 AM'), end: parseTimeToMinutes('11:45 AM') },
      { slot: '11:45 AM - 12:40 PM', start: parseTimeToMinutes('11:45 AM'), end: parseTimeToMinutes('12:40 PM') },
      { slot: '01:30 PM - 03:30 PM', start: parseTimeToMinutes('01:30 PM'), end: parseTimeToMinutes('03:30 PM') }
    ];

    // Break slots (indices): after slot index 1 (Tea break), after slot index 3 (Lunch)
    const BREAK_AFTER_SLOT_INDEX = new Set([1, 3]);

    const generatedSlots = [];
    const errors = [];
    const ownedCourseIds = await Course.find({
      createdByAdmin: tenantAdminId,
      institutionType: getInstitutionTypeFilter(instType),
      branch: targetBranch,
      semester: targetSem,
      standard: targetStandard,
      pucYear: targetPucYear,
      pucDept: targetPucDept
    }).distinct('_id');

    // ── Delete existing timetable for all target divisions ────────────────────
    for (const div of targetDivs) {
      const deleteQuery = {
        division: div,
        semester: targetSem,
        branch: targetBranch,
        standard: targetStandard,
        pucYear: targetPucYear,
        pucDept: targetPucDept,
        institutionType: getInstitutionTypeFilter(instType),
        course: { $in: ownedCourseIds }
      };
      await Timetable.deleteMany(deleteQuery);
    }

    // ── ALGORITHM: Round-Robin with Constraint Satisfaction ──────────────────
    // We maintain per-division and per-teacher state across the scheduling loop.
    // For each (day, slot, division) triple we attempt to place the best fitting subject.

    const subjectWeekHours = {};
    const subjectDayHours = {};

    // Classroom assignment per division
    const divClassrooms = {};
    for (let i = 0; i < targetDivs.length; i++) {
      const div = targetDivs[i];
      if (classrooms && classrooms[div]) {
        divClassrooms[div] = classrooms[div];
      } else {
        const rooms = ['Smart Lecture Hall LH-301', 'Smart Lecture Hall LH-302', 'Class Room: AS-11', 'Class Room: AS-12', 'Class Room: AS-13'];
        divClassrooms[div] = rooms[i % rooms.length];
      }
    }

    // Pre-fetch already-scheduled slots for teachers in OTHER divisions to avoid double-booking
    // (These are slots NOT being deleted — i.e., from other branch/sem)
    const allExistingTeacherSlots = await Timetable.find({
      branch: targetBranch,
      semester: targetSem,
      standard: targetStandard,
      pucYear: targetPucYear,
      pucDept: targetPucDept,
      institutionType: getInstitutionTypeFilter(instType),
      division: { $nin: targetDivs },
      course: { $in: ownedCourseIds }
    }).select('day timeSlot teacher division');

    for (const div of targetDivs) {
      const divisionSubjects = subjectsWithTeachers.filter(subject => subject.division === div);
      // Coordinator per division
      let coordinator = 'Class Coordinator';
      if (div === 'A') coordinator = 'Prof. Pavan K.K';
      else if (div === 'B') coordinator = 'Dr. A.A. Quazi';
      else if (div === 'C') coordinator = 'Prof. Nandini C.V';

      const classroom = divClassrooms[div];

      // Round-robin pointer per division (start at different offsets to distribute subjects evenly)
      let subjectPointer = 0;

      // Track what teacher is doing on each day for THIS division's generation pass
      // We accumulate newlyGeneratedSlots for real-time constraint checking
      const thisPassSlots = [];   // slots generated so far in this division pass

      for (const day of days) {
        subjectPointer = days.indexOf(day) % divisionSubjects.length;
        const isSaturday = day === 'Saturday';
        const slotsForDay = isSaturday
          ? timeSlots.slice(0, 3) // Saturday: slots 0,1,2 only
          : timeSlots;

        for (let slotIdx = 0; slotIdx < slotsForDay.length; slotIdx++) {
          const { slot, start: slotStart, end: slotEnd } = slotsForDay[slotIdx];
          const slotHours = Math.max(1, Math.round((slotEnd - slotStart) / 60));

          // Try to find a valid subject for this slot
          let placed = false;
          let attempts = 0;
          const maxAttempts = divisionSubjects.length * 2;

          while (!placed && attempts < maxAttempts) {
            const candidate = divisionSubjects[(subjectPointer + attempts) % divisionSubjects.length];
            const teacher = candidate.teacher;
            const tid = teacher._id.toString();
            const subjectDivisionKey = `${candidate.subjectCode}:${div}`;
            const subjectDayKey = `${subjectDivisionKey}:${day}`;
            const weeklyTarget = Math.round(candidate.weeklyHours);
            const dailyTarget = candidate.dailyHourTargets[days.indexOf(day)];
            const currentWeekHours = subjectWeekHours[subjectDivisionKey] || 0;
            const currentDayHours = subjectDayHours[subjectDayKey] || 0;
            const withinWeeklyHours = weeklyTarget > 0 &&
              currentWeekHours + slotHours <= weeklyTarget + (slotHours === 2 ? 1 : 0);
            const withinDailyHours = dailyTarget > 0 &&
              currentDayHours + slotHours <= dailyTarget + (slotHours === 2 ? 1 : 0);
            if (!withinWeeklyHours || !withinDailyHours) { attempts++; continue; }

            // ── Constraint A: Division double-booking ─────────────────────────
            const divConflict = thisPassSlots.some(
              s => s.day === day && s.timeSlot === slot && s.division === div
            );
            if (divConflict) { attempts++; continue; }

            // ── Constraint B: Teacher time overlap (all divisions, this pass + existing) ─
            const teacherBusyNow = generatedSlots.some(s => {
              if (s.teacher.toString() !== tid || s.day !== day) return false;
              const sT = parseSlotTimes(s.timeSlot);
              return sT && slotStart < sT.end && slotEnd > sT.start;
            }) || allExistingTeacherSlots.some(s => {
              if (s.teacher.toString() !== tid || s.day !== day) return false;
              const sT = parseSlotTimes(s.timeSlot);
              return sT && slotStart < sT.end && slotEnd > sT.start;
            });
            if (teacherBusyNow) { attempts++; continue; }

            // ── Constraint C: Teacher ≥15 min break ──────────────────────────
            const teacherDaySlotsThisPass = generatedSlots.filter(
              s => s.day === day && s.teacher.toString() === tid
            );
            const allTeacherDaySlots = [
              ...teacherDaySlotsThisPass,
              ...allExistingTeacherSlots.filter(s => s.day === day && s.teacher.toString() === tid)
            ];
            const breakViolation = checkTeacherBreakViolation(slot, allTeacherDaySlots, teacher.name);
            if (breakViolation) { attempts++; continue; }

            // ── Constraint D: Classroom double-booking ────────────────────────
            const roomBusy = generatedSlots.some(
              s => s.day === day && s.timeSlot === slot && s.classroom === classroom && s.division !== div
            );
            if (roomBusy) { attempts++; continue; }

            // ✅ All constraints passed — place this slot
            const newSlot = {
              day, timeSlot: slot,
              course: candidate.courseId,
              teacher: teacher._id,
              division: div,
              classroom,
              semester: targetSem,
              branch: targetBranch,
              startMinutes: slotStart,
              endMinutes: slotEnd,
              institutionType: instType,
              standard: targetStandard,
              pucYear: targetPucYear,
              pucDept: targetPucDept,
              classCoordinator: coordinator,
              semesterRef: semDoc?._id || null
            };

            thisPassSlots.push({ ...newSlot, teacher: tid });
            generatedSlots.push(newSlot);
            subjectWeekHours[subjectDivisionKey] = currentWeekHours + slotHours;
            subjectDayHours[subjectDayKey] = currentDayHours + slotHours;
            subjectPointer = (subjectPointer + attempts + 1) % divisionSubjects.length;
            placed = true;
          }

          if (!placed) {
            continue;
          }
        }
      }
    }

    for (const div of targetDivs) {
      for (const subject of subjectsWithTeachers.filter(item => item.division === div)) {
        const subjectDivisionKey = `${subject.subjectCode}:${div}`;
        const targetHours = Math.round(subject.weeklyHours);
        const scheduledHours = subjectWeekHours[subjectDivisionKey] || 0;
        if (scheduledHours < targetHours) {
          errors.push(`Division ${div}: ${subject.subjectTitle} scheduled for ${scheduledHours} of ${targetHours} weekly hours.`);
        }
      }
    }

    // ── Bulk insert ───────────────────────────────────────────────────────────
    await Timetable.insertMany(generatedSlots);

    const filter = {
      semester: targetSem,
      branch: targetBranch,
      standard: targetStandard,
      pucYear: targetPucYear,
      pucDept: targetPucDept,
      institutionType: getInstitutionTypeFilter(instType),
      division: { $in: targetDivs },
      course: { $in: ownedCourseIds }
    };
    const generated = await Timetable.find(filter)
      .populate('course', 'code title department branch')
      .populate('teacher', 'name teacherId email');

    return res.json({
      success: true,
      message: `Timetable generated for Division(s) ${targetDivs.join(', ')} — ${targetBranch} Sem ${targetSem}. Total ${generatedSlots.length} slots created with 0 teacher/room conflicts.`,
      slots: generated,
      warnings: errors
    });
  } catch (error) {
    console.error('Timetable generation error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════
//  DIVISION ALLOCATION
// ═══════════════════════════════════════════════════════════════════

exports.allocateDivisions = async (req, res) => {
  try {
    const {
      mode, semester, standard, branch, pucYear, pucDept,
      divisionsList, allocations
    } = req.body;
    if (mode === 'auto') {
      // Scope to the admin's own institution type
      const adminUser = await User.findById(req.user._id);
      const instType = normalizeInstitutionType(adminUser?.institutionType || 'institute');
      const typeFilter = getInstitutionTypeFilter(instType);

      const tenantAdminId = getTenantAdminId(req.user);
      if (!tenantAdminId) {
        return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
      }
      const query = {
        role: 'student',
        institutionType: typeFilter,
        createdByAdmin: tenantAdminId
      };
      if (semester) query.semester = Number(semester);
      if (standard) query.standard = standard;
      if (branch)   query.branch = branch;
      if (pucYear) query.pucYear = pucYear;
      if (pucDept) query.pucDept = pucDept;

      const targetStudents = await User.find(query).sort({ usn: 1, name: 1 });
      if (targetStudents.length === 0) {
        return res.status(400).json({ success: false, message: 'No students found for the selected criteria.' });
      }

      const divs = Array.isArray(divisionsList)
        ? [...new Set(divisionsList.map(d => String(d).trim().toUpperCase()).filter(Boolean))]
        : [];
      if (divs.length === 0) {
        return res.status(400).json({ success: false, message: 'Select at least one division before allocating students.' });
      }

      const divisionSummary = {};
      const updates = targetStudents.map((student, index) => {
        const assignedDiv = divs[index % divs.length];
        divisionSummary[assignedDiv] = (divisionSummary[assignedDiv] || 0) + 1;
        return {
          updateOne: {
            filter: { _id: student._id, createdByAdmin: tenantAdminId, role: 'student' },
            update: { $set: { division: assignedDiv, section: assignedDiv, divisionAllocated: true } }
          }
        };
      });
      await User.bulkWrite(updates, { ordered: true });

      const summaryText = Object.entries(divisionSummary).map(([d, c]) => `Div ${d}: ${c}`).join(', ');
      return res.json({
        success: true,
        message: `Auto-allocated ${targetStudents.length} students: ${summaryText}.`,
        summary: divisionSummary
      });
    } else {
      if (!allocations || !Array.isArray(allocations))
        return res.status(400).json({ success: false, message: 'Allocations array required for manual mode.' });
      for (const item of allocations) {
        if (item.studentId && item.division) {
          await User.findOneAndUpdate({
            _id: item.studentId,
            role: 'student',
            institutionType: getInstitutionTypeFilter(normalizeInstitutionType(req.user.institutionType || 'institute')),
            createdByAdmin: getTenantAdminId(req.user)
          }, {
            $set: { division: item.division.toUpperCase(), section: item.division.toUpperCase(), divisionAllocated: true }
          });
        }
      }
      return res.json({ success: true, message: `Updated divisions for ${allocations.length} students.` });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════
//  TEACHER & COURSE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

exports.assignTeacherToCourse = async (req, res) => {
  try {
    const { courseId, teacherId } = req.body;
    if (!courseId || !teacherId)
      return res.status(400).json({ success: false, message: 'courseId and teacherId are required.' });

    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const targetCourse = await Course.findOne({ _id: courseId, createdByAdmin: tenantAdminId });
    if (!targetCourse) return res.status(404).json({ success: false, message: 'Course not found or access denied.' });

    const adminType = normalizeInstitutionType(req.user.institutionType || 'institute');
    const teacher = await User.findOne({
      _id: teacherId,
      role: 'teacher',
      createdByAdmin: tenantAdminId,
      institutionType: getInstitutionTypeFilter(adminType)
    });
    if (!teacher) {
      return res.status(400).json({ success: false, message: 'Choose a teacher from your institution.' });
    }
    if (((adminType === 'institute' || adminType === 'diploma') &&
          (teacher.branch || teacher.department) !== (targetCourse.branch || targetCourse.department)) ||
        (adminType === 'pu_college' &&
          (teacher.pucDept !== targetCourse.pucDept ||
            (teacher.pucYear && teacher.pucYear !== targetCourse.pucYear)))) {
      return res.status(400).json({ success: false, message: 'The teacher must belong to the course department.' });
    }

    const identity = normalizeCourseIdentity(targetCourse.code, targetCourse.title);
    const sectionedTitle = String(targetCourse.title || '').match(/^(.*?)(?:\s*-\s*|\s+)Section\s+([A-F])$/i);
    const targetDivision = String(targetCourse.section || sectionedTitle?.[2] || '').toUpperCase();
    const relatedCourseIds = [targetCourse._id];

    // 1-subject-per-teacher-per-semester constraint (scoped to this admin's courses)
    const conflictCourse = await Course.findOne({
      teacher: teacherId,
      semester: targetCourse.semester,
      branch: targetCourse.branch,
      standard: targetCourse.standard,
      pucYear: targetCourse.pucYear,
      pucDept: targetCourse.pucDept,
      section: targetDivision,
      institutionType: targetCourse.institutionType,
      createdByAdmin: tenantAdminId,
      _id: { $nin: relatedCourseIds }
    });
    if (conflictCourse) {
      const teacher = await User.findById(teacherId).select('name');
      return res.status(400).json({
        success: false,
        message: `${teacher?.name || 'This teacher'} is already assigned to "${conflictCourse.code} - ${conflictCourse.title}" in Semester ${targetCourse.semester}. One teacher per subject per semester.`
      });
    }

    await Course.updateOne({ _id: targetCourse._id, createdByAdmin: tenantAdminId }, {
      $set: { teacher: teacherId, code: identity.code, title: identity.title, section: targetDivision }
    });
    if (targetCourse.semesterRef) {
      const semesterConfig = await Semester.findOne({ _id: targetCourse.semesterRef, adminId: tenantAdminId });
      if (semesterConfig) {
        const subject = semesterConfig.subjects.find(item =>
          normalizeCourseIdentity(item.code, item.title).code === identity.code &&
          String(item.division || normalizeCourseIdentity(item.code, item.title).division).toUpperCase() === targetDivision
        );
        if (subject) subject.teacher = teacherId;
        await semesterConfig.save();
      }
    }
    const updated = await Course.findById(courseId)
      .populate('teacher', 'name teacherId email');
    await Timetable.updateMany({
      course: { $in: relatedCourseIds },
      institutionType: getInstitutionTypeFilter(adminType)
    }, { $set: { teacher: teacherId } });
    return res.json({
      success: true,
      message: `Assigned ${updated.teacher?.name} to ${identity.code}${targetDivision ? ` for Division ${targetDivision}` : ''}.`,
      course: updated
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    // Always scope to logged-in admin's institution type — never mix types
    const adminUser = await User.findById(req.user._id);
    const adminInstType = adminUser?.institutionType || 'institute';
    const typeFilter = adminInstType === 'institute' || adminInstType === 'college'
      ? { $in: ['institute', 'college'] }
      : adminInstType;

    const { role, semester, standard, branch, division, pucYear, pucDept, search } = req.query;
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const filter = { institutionType: typeFilter, createdByAdmin: tenantAdminId };
    if (role) filter.role = role;
    if (role === 'admin') {
      filter.$or = [{ createdByAdmin: tenantAdminId }, { _id: tenantAdminId }];
    }
    if (semester) filter.semester = Number(semester);
    if (standard) filter.standard = standard;
    if (branch) filter.branch = branch;
    if (division) filter.division = division.toUpperCase();
    if (pucYear) filter.pucYear = pucYear;
    if (pucDept) filter.pucDept = pucDept;

    if (search?.trim()) {
      const escapedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      filter.$and = [{
        $or: [
        { name: searchRegex },
        { email: searchRegex },
        { usn: searchRegex },
        { teacherId: searchRegex },
        { adminId: searchRegex }
        ]
      }];
    }

    const projection = 'name email role adminId teacherId usn branch department semester standard pucYear pucDept section division faceRegistered isActive createdAt';
    const paginated = req.query.page !== undefined || req.query.limit !== undefined;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const query = User.find(filter).select(projection).sort({ usn: 1, name: 1, createdAt: -1 }).lean();

    if (paginated) {
      const [users, total] = await Promise.all([
        query.skip((page - 1) * limit).limit(limit),
        User.countDocuments(filter)
      ]);
      return res.json({
        success: true,
        users,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    }

    const users = await query;
    return res.json({ success: true, users });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleUserStatus = async (req, res) => {
  try {
    const adminType = normalizeInstitutionType(req.user.institutionType || 'institute');
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const user = await User.findOne({
      _id: req.params.userId,
      institutionType: getInstitutionTypeFilter(adminType),
      createdByAdmin: tenantAdminId,
      role: { $in: ['student', 'teacher'] }
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    user.isActive = !user.isActive;
    await user.save();
    return res.json({ success: true, message: `${user.name} is now ${user.isActive ? 'Active' : 'Deactivated'}.`, user: user.toSafeObject() });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCourse = async (req, res) => {
  try {
    const adminUser = await User.findById(req.user._id);
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const { code, title, department, branch, semester, teacherId, section,
            standard, pucYear, pucDept } = req.body;
    if (!code || !title) return res.status(400).json({ success: false, message: 'Code and title are required.' });
    const identity = normalizeCourseIdentity(code, title);
    if (!identity.code || !identity.title) {
      return res.status(400).json({ success: false, message: 'Course code and title must remain non-empty after removing any division suffix.' });
    }

    const instType = adminUser?.institutionType || 'institute';
    const targetBranch = instType === 'school' || instType === 'pu_college'
      ? ''
      : branch || department || '';
    const targetSemester = Number(semester) || 6;
    const existingCourses = await Course.find({
      createdByAdmin: tenantAdminId,
      institutionType: getInstitutionTypeFilter(instType),
      branch: targetBranch,
      semester: targetSemester,
      standard: standard || '',
      pucYear: pucYear || '',
      pucDept: pucDept || '',
      section: String(section || '').toUpperCase()
    }).select('code title');
    const existing = existingCourses.find(course => {
      const currentIdentity = normalizeCourseIdentity(course.code, course.title);
      return currentIdentity.code === identity.code && currentIdentity.title.toLowerCase() === identity.title.toLowerCase();
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `This semester already has the course "${identity.title}" with code ${identity.code}.`
      });
    }

    let targetTeacher = null;
    if (teacherId) {
      targetTeacher = await User.findOne({
        _id: teacherId,
        role: 'teacher',
        createdByAdmin: tenantAdminId,
        institutionType: getInstitutionTypeFilter(instType)
      });
      if (!targetTeacher) {
        return res.status(400).json({ success: false, message: 'Choose a teacher from your institution.' });
      }
      if (((instType === 'institute' || instType === 'diploma') &&
            (targetTeacher.branch || targetTeacher.department) !== targetBranch) ||
          (instType === 'pu_college' && targetTeacher.pucDept !== pucDept)) {
        return res.status(400).json({ success: false, message: 'The teacher must belong to the course department.' });
      }
      const conflict = await Course.findOne({
        teacher: teacherId, semester: targetSemester,
        branch: targetBranch,
        standard: standard || '',
        pucYear: pucYear || '',
        pucDept: pucDept || '',
        section: String(section || '').toUpperCase(),
        institutionType: getInstitutionTypeFilter(instType),
        createdByAdmin: tenantAdminId
      });
      if (conflict) {
        const teacher = await User.findById(teacherId).select('name');
        return res.status(400).json({
          success: false,
          message: `${teacher?.name} is already assigned to "${conflict.code}" in Semester ${targetSemester}.`
        });
      }
    }

    const newCourse = new Course({
      code: identity.code,
      title: identity.title,
      department: instType === 'school' ? '' : instType === 'pu_college' ? pucDept || '' : targetBranch,
      branch: targetBranch,
      semester: targetSemester,
      section: String(section || '').toUpperCase(),
      teacher: targetTeacher?._id || null,
      institutionType: instType,
      standard: standard || '',
      pucYear: pucYear || '',
      pucDept: pucDept || '',
      createdByAdmin: tenantAdminId
    });
    await newCourse.save();
    return res.status(201).json({ success: true, message: 'Course created.', course: newCourse });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCourses = async (req, res) => {
  try {
    // Only return courses created by THIS admin — no cross-institution leakage
    const { branch, semester, standard, pucYear, pucDept, section } = req.query;
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const filter = { createdByAdmin: tenantAdminId };
    if (branch) filter.branch = branch;
    if (semester) filter.semester = Number(semester);
    if (standard) filter.standard = standard;
    if (pucYear) filter.pucYear = pucYear;
    if (pucDept) filter.pucDept = pucDept;
    if (section) filter.section = String(section).toUpperCase();

    const courses = await Course.find(filter)
      .populate('teacher', 'name teacherId email');
    return res.json({ success: true, courses });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET Teacher's Timetable (for teacher dashboard) ─────────────────────────
exports.getTeacherTimetable = async (req, res) => {
  try {
    const teacherId = req.params.teacherId || req.user._id;
    const actorType = normalizeInstitutionType(req.user.institutionType || 'institute');
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }
    if (req.user.role === 'teacher' && teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only view your own timetable.' });
    }

    const teacher = await User.findOne({
      _id: teacherId,
      role: 'teacher',
      createdByAdmin: tenantAdminId,
      institutionType: getInstitutionTypeFilter(actorType)
    });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found in your institution.' });

    const departmentCourseFilter = {
      createdByAdmin: tenantAdminId,
      institutionType: getInstitutionTypeFilter(actorType)
    };
    if (actorType === 'institute' || actorType === 'diploma') {
      departmentCourseFilter.branch = teacher.branch || teacher.department;
    } else if (actorType === 'pu_college') {
      departmentCourseFilter.pucDept = teacher.pucDept || teacher.department;
    } else if (teacher.standard) {
      departmentCourseFilter.standard = teacher.standard;
    }

    const [departmentCourseIds, assignedCourseIds] = await Promise.all([
      Course.find(departmentCourseFilter).distinct('_id'),
      Course.find({ teacher: teacherId, createdByAdmin: tenantAdminId }).distinct('_id')
    ]);
    const [departmentSlots, slots] = await Promise.all([
      Timetable.find({
        course: { $in: departmentCourseIds },
        institutionType: getInstitutionTypeFilter(actorType)
      })
        .populate('course', 'code title department branch semester standard pucYear pucDept')
        .populate('teacher', 'name teacherId')
        .sort({ semester: 1, standard: 1, pucYear: 1, division: 1, day: 1, startMinutes: 1 }),
      Timetable.find({
      teacher: teacherId,
      course: { $in: assignedCourseIds },
      institutionType: getInstitutionTypeFilter(actorType)
      })
        .populate('course', 'code title department branch semester standard pucYear pucDept')
        .populate('teacher', 'name teacherId')
        .sort({ semester: 1, standard: 1, pucYear: 1, division: 1, day: 1, startMinutes: 1 })
    ]);
    return res.json({ success: true, slots, assignedSlots: slots, departmentSlots });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET Current active slot for a teacher (for attendance locking) ──────────
exports.getTeacherActiveSlot = async (req, res) => {
  try {
    const teacherId = req.params.teacherId || req.user._id;
    const actorType = normalizeInstitutionType(req.user.institutionType || 'institute');
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }
    if (req.user.role === 'teacher' && teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only view your own timetable.' });
    }
    const teacher = await User.findOne({
      _id: teacherId,
      role: 'teacher',
      createdByAdmin: tenantAdminId,
      institutionType: getInstitutionTypeFilter(actorType)
    });
    if (!teacher) return res.status(404).json({ success: false, message: 'Teacher not found in your institution.' });

    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = days[now.getDay()];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const courseIds = await Course.find({ teacher: teacherId, createdByAdmin: tenantAdminId }).distinct('_id');

    const todaySlots = await Timetable.find({
      teacher: teacherId,
      course: { $in: courseIds },
      day: todayName,
      institutionType: getInstitutionTypeFilter(actorType)
    })
      .populate('course', 'code title department branch semester')
      .sort({ startMinutes: 1 });

    let activeSlot = null;
    let upcomingSlot = null;

    for (const slot of todaySlots) {
      const times = getTimetableSlotTimes(slot);
      if (!times) continue;
      const { start, end } = times;
      const graceEnd = end + 30; // 30 min grace period for attendance

      if (nowMinutes >= start && nowMinutes <= graceEnd) {
        activeSlot = slot;
        break;
      }
      if (nowMinutes < start && !upcomingSlot) {
        upcomingSlot = slot;
      }
    }

    return res.json({ success: true, activeSlot, upcomingSlot, todaySlots });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════════════
//  SEED DEMO DATA
// ═══════════════════════════════════════════════════════════════════

// ── helper: random Indian name ───────────────────────────────────────────────
// ─── FACULTY LOCATION TRACKER ────────────────────────────────────────────────
// Returns real-time location of every teacher:
//   • "In Class"  – if they have a timetable slot matching today + current time
//   • "In Cabin"  – if no active slot right now
exports.getFacultyTracker = async (req, res) => {
  try {
    const adminUser = await User.findById(req.user._id);
    const adminInstType = adminUser?.institutionType || 'institute';
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }
    const typeFilter = getInstitutionTypeFilter(adminInstType);
    const courseIds = await Course.find({ createdByAdmin: tenantAdminId }).distinct('_id');

    const now = new Date();
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const todayName = dayNames[now.getDay()];
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // Only teachers of this admin's institution type
    const teachers = await User.find({
      role: 'teacher',
      isActive: true,
      institutionType: typeFilter,
      createdByAdmin: tenantAdminId
    })
      .select('name teacherId email department branch profileImage')
      .sort({ department: 1, name: 1 });

    // Today's timetable slots scoped to this institution type
    const todaySlots = await Timetable.find({
      day: todayName,
      institutionType: typeFilter,
      course: { $in: courseIds }
    })
      .populate('course', 'code title semester branch')
      .populate('teacher', '_id');

    const result = teachers.map(t => {
      const tid = t._id.toString();
      const activeSlot = todaySlots.find(s => {
        const assignedTeacherId = s.teacher?._id || s.teacher;
        if (!assignedTeacherId || assignedTeacherId.toString() !== tid) return false;
        const times = getTimetableSlotTimes(s);
        if (!times) return false;
        const { start, end } = times;
        return nowMin >= start && nowMin <= end + 30;
      });

      const todaySchedule = todaySlots
        .filter(s => {
          const assignedTeacherId = s.teacher?._id || s.teacher;
          return assignedTeacherId && assignedTeacherId.toString() === tid;
        })
        .map(s => {
          const times = getTimetableSlotTimes(s);
          return {
            timeSlot: s.timeSlot,
            subject: s.course?.code + ' — ' + s.course?.title,
            semester: s.course?.semester,
            branch: s.branch || s.course?.branch,
            division: s.division,
            classroom: s.classroom,
            startMinutes: times?.start ?? null,
            endMinutes: times?.end ?? null,
            isActive: Boolean(times && nowMin >= times.start && nowMin <= times.end + 30)
          };
        })
        .sort((a, b) => (a.startMinutes || 0) - (b.startMinutes || 0));

      return {
        _id: t._id, name: t.name, teacherId: t.teacherId, email: t.email,
        department: t.department || t.branch, profileImage: t.profileImage,
        status: activeSlot ? 'in_class' : 'in_cabin',
        statusLabel: activeSlot ? 'In Class' : 'In Cabin',
        activeClass: activeSlot ? {
          timeSlot: activeSlot.timeSlot,
          subject: activeSlot.course?.code + ' — ' + activeSlot.course?.title,
          semester: activeSlot.course?.semester,
          branch: activeSlot.branch || activeSlot.course?.branch,
          division: activeSlot.division,
          classroom: activeSlot.classroom
        } : null,
        todaySchedule
      };
    });

    return res.json({ success: true, teachers: result, day: todayName, time: `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}` });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
