const AttendanceSession = require('../models/AttendanceSession');
const Course = require('../models/Course');
const User = require('../models/User');
const Timetable = require('../models/Timetable');
const faceEngine = require('../services/faceEngine');
const {
  getInstitutionTypeFilter,
  getTenantAdminId,
  isSameInstitution,
  normalizeInstitutionType
} = require('../config/institutions');
const { saveUploadedFile } = require('../services/uploadService');

// Helper: parse time string to minutes
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

function getCourseRosterFilter(course, tenantAdminId, institutionType, division) {
  const filter = {
    role: 'student',
    institutionType: getInstitutionTypeFilter(institutionType),
    createdByAdmin: tenantAdminId
  };
  if (institutionType === 'school') {
    filter.standard = course.standard;
  } else if (institutionType === 'pu_college') {
    filter.pucYear = course.pucYear;
    filter.pucDept = course.pucDept;
  } else {
    filter.branch = course.branch;
    filter.semester = course.semester;
  }

  const section = (division || course.section || '').toUpperCase();
  if (section) {
    filter.section = section;
    filter.division = section;
  }
  if (course.enrolledStudents?.length) {
    filter._id = {
      $in: course.enrolledStudents.map(student => student._id || student)
    };
  }
  return filter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Check if a teacher is allowed to take attendance RIGHT NOW
// Rule: attendance can only be submitted if the timetable has a matching slot
//       for today's day, and the current time is within [slotStart, slotEnd + 30min].
// Returns { allowed: bool, slot: TimetableDoc | null, reason: string }
// ─────────────────────────────────────────────────────────────────────────────
async function checkAttendanceWindow(teacherId, courseId, timeSlotOverride) {
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = dayNames[now.getDay()];
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Find ALL timetable slots for this teacher + course + today
  const todaySlots = await Timetable.find({
    teacher: teacherId,
    course: courseId,
    day: todayName
  }).populate('course', 'code title');

  if (todaySlots.length === 0) {
    // No scheduled class for this teacher+course today — locked
    return {
      allowed: false,
      slot: null,
      reason: `No timetable slot found for this subject on ${todayName}. Attendance can only be taken during scheduled class periods.`
    };
  }

  // Check if current time falls in any of today's slots (+ 30 min grace)
  for (const slot of todaySlots) {
    const startMin = slot.startMinutes || parseTimeToMinutes(slot.timeSlot.split(/[-–]/)[0]);
    const endMin = slot.endMinutes || parseTimeToMinutes((slot.timeSlot.split(/[-–]/)[1] || ''));
    const graceEndMin = endMin + 30;

    if (nowMinutes >= startMin && nowMinutes <= graceEndMin) {
      return { allowed: true, slot, reason: 'Within scheduled window.' };
    }
  }

  // Time is outside all slots
  const slotTimes = todaySlots.map(s => s.timeSlot).join(', ');
  return {
    allowed: false,
    slot: null,
    reason: `Current time is outside the scheduled class window(s) for ${todayName}: ${slotTimes}. Attendance window closes 30 minutes after the slot ends.`
  };
}

// Get list of courses assigned to the logged-in teacher (from timetable) — scoped to teacher's institution type
exports.getTeacherCourses = async (req, res) => {
  try {
    const teacherUser = await User.findById(req.user._id);
    const teacherId = req.user._id;
    const instType = teacherUser?.institutionType || 'institute';
    const tenantAdminId = getTenantAdminId(teacherUser);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }
    const typeFilter = getInstitutionTypeFilter(instType);

    const assignedCourseIds = await Course.find({
      teacher: teacherId,
      createdByAdmin: tenantAdminId
    }).distinct('_id');
    let courses = await Course.find({
      _id: { $in: assignedCourseIds },
      institutionType: typeFilter
    })
      .populate('enrolledStudents', 'name usn department semester branch division faceRegistered profileImage');

    // Also get courses from timetable slots for this teacher
    const timetableSlotCourseIds = await Timetable.find({
      teacher: teacherId,
      course: { $in: assignedCourseIds }
    }).distinct('course');
    if (timetableSlotCourseIds.length > 0) {
      const timetableCourses = await Course.find({
        _id: { $in: timetableSlotCourseIds },
        institutionType: typeFilter,
        createdByAdmin: tenantAdminId
      }).populate('enrolledStudents', 'name usn department semester branch division faceRegistered profileImage');

      const courseIds = new Set(courses.map(c => c._id.toString()));
      for (const tc of timetableCourses) {
        if (!courseIds.has(tc._id.toString())) {
          courses.push(tc);
          courseIds.add(tc._id.toString());
        }
      }
    }

    // No fallback to all courses — if teacher has nothing assigned, return empty
    return res.json({ success: true, courses });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get all enrolled students for a specific course (including face registration status)
exports.getCourseStudents = async (req, res) => {
  try {
    const { courseId } = req.params;
    const actorType = normalizeInstitutionType(req.user.institutionType || 'institute');
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }
    const course = await Course.findOne({
      _id: courseId,
      createdByAdmin: tenantAdminId,
      institutionType: getInstitutionTypeFilter(actorType)
    });

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    if (req.user.role === 'teacher' && course.teacher?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this course.' });
    }
    if (req.user.role === 'admin' && course.createdByAdmin?.toString() !== tenantAdminId.toString()) {
      return res.status(403).json({ success: false, message: 'Course access denied.' });
    }

    const division = String(req.query.division || course.section || '').toUpperCase();
    if (req.user.role === 'teacher' && division) {
      const assignedSlot = await Timetable.exists({
        course: course._id,
        teacher: req.user._id,
        division,
        institutionType: getInstitutionTypeFilter(actorType)
      });
      if (!assignedSlot) {
        return res.status(403).json({ success: false, message: 'You are not assigned to this course in the selected division.' });
      }
    }

    const students = await User.find(getCourseRosterFilter(course, tenantAdminId, actorType, division))
      .select('name usn email department semester section faceRegistered profileImage faceDescriptor')
      .sort({ usn: 1 });

    return res.json({
      success: true,
      course: {
        id: course._id,
        code: course.code,
        title: course.title,
        classroom: division
      },
      students
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Process Full Classroom Photo and Record Attendance
exports.processClassroomAttendance = async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Only assigned teachers can submit attendance.' });
    }

    const teacherId = req.user._id;
    const { courseId, classroom, sessionDate, notes, timeSlot, teacherPhoto } = req.body;

    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Course ID is required' });
    }

    const actorType = normalizeInstitutionType(req.user.institutionType || 'institute');
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }
    const course = await Course.findOne({
      _id: courseId,
      teacher: teacherId,
      createdByAdmin: tenantAdminId,
      institutionType: getInstitutionTypeFilter(actorType)
    });
    if (!course) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this course in your institution.' });
    }

    // ── Timetable-based attendance window enforcement ─────────────────────────
    const windowCheck = await checkAttendanceWindow(teacherId, courseId, timeSlot);
    if (!windowCheck.allowed) {
      return res.status(403).json({
        success: false,
        message: windowCheck.reason,
        locked: true
      });
    }

    let photoUrl = '';
    let teacherPhotoUrl = req.body.teacherPhotoUrl || teacherPhoto || '';

    const uploadedPhotos = [
      ...(req.file ? [{ ...req.file, fieldname: req.file.fieldname || 'classroomPhoto' }] : []),
      ...(Array.isArray(req.files)
        ? req.files
        : Object.values(req.files || {}).flat())
    ];
    for (const file of uploadedPhotos) {
      const uploadedUrl = await saveUploadedFile(file, 'classroom');
      if (file.fieldname === 'teacherPhoto') teacherPhotoUrl = uploadedUrl;
      else photoUrl = uploadedUrl;
    }
    if (!photoUrl) {
      photoUrl = req.body.classroomPhotoUrl || req.body.classroomPhoto || req.body.samplePhotoUrl || '/classroom_60_divA.jpg';
    }

    // Fetch enrolled students
    const scheduledDivision = windowCheck.slot?.division || course.section;
    const enrolledStudents = await User.find(getCourseRosterFilter(course, tenantAdminId, actorType, scheduledDivision));
    if (enrolledStudents.length === 0) {
      return res.status(400).json({ success: false, message: 'This course has no students in its assigned section.' });
    }

    // Parse detected faces payload from client (if face-api processed on browser or provided)
    let clientDetections = [];
    if (req.body.detections) {
      try {
        clientDetections = typeof req.body.detections === 'string' ? JSON.parse(req.body.detections) : req.body.detections;
      } catch (e) {
        clientDetections = [];
      }
    }

    // Parse any manual overrides provided by the teacher
    let manualOverrides = {};
    if (req.body.manualOverrides) {
      try {
        manualOverrides = typeof req.body.manualOverrides === 'string' ? JSON.parse(req.body.manualOverrides) : req.body.manualOverrides;
      } catch (e) {
        manualOverrides = {};
      }
    }

    // Execute Face Matching using Pure JavaScript Face Engine
    let matchedResults;
    if (clientDetections.length > 0) {
      matchedResults = faceEngine.matchClassroomDetections(clientDetections, enrolledStudents);
    } else {
      matchedResults = { detections: [], matchedStudentIds: [] };
    }

    const matchedIdsSet = new Set(matchedResults.matchedStudentIds);

    // Build attendance records for all enrolled students
    const records = enrolledStudents.map(student => {
      const studentIdStr = student._id.toString();
      const isMatched = matchedIdsSet.has(studentIdStr);
      
      const detection = matchedResults.detections.find(
        d => d.matched && d.student && d.student._id.toString() === studentIdStr
      );

      const hasManualOverride = manualOverrides[studentIdStr] !== undefined;
      const finalStatus = hasManualOverride 
        ? manualOverrides[studentIdStr] 
        : (isMatched ? 'Present' : 'Absent');

      return {
        student: student._id,
        usn: student.usn,
        name: student.name,
        status: finalStatus,
        confidence: detection ? detection.confidence : (isMatched ? 92.5 : 0),
        detectedBox: detection ? detection.box : { x: 0, y: 0, width: 0, height: 0 },
        isManuallyOverridden: hasManualOverride
      };
    });

    const totalEnrolled = records.length;
    const totalPresent = records.filter(r => r.status === 'Present').length;
    const totalAbsent = totalEnrolled - totalPresent;
    const attendancePercentage = totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0;

    const newSession = new AttendanceSession({
      course: course._id,
      teacher: teacherId,
      institutionType: actorType,
      division: scheduledDivision || '',
      classroom: classroom || 'Class Room: AS-11',
      sessionDate: sessionDate ? new Date(sessionDate) : new Date(),
      timeSlot: timeSlot || '08:30 AM - 09:25 AM',
      classPhoto: photoUrl,
      teacherPhoto: teacherPhotoUrl || req.user.profileImage || '/logo.jpg',
      teacherAttendanceStatus: 'Present',
      detectedFacesCount: clientDetections.length,
      matchedStudentsCount: matchedResults.matchedStudentIds.length,
      records,
      totalEnrolled,
      totalPresent,
      totalAbsent,
      attendancePercentage,
      status: 'Finalized',
      notes: notes || ''
    });

    await newSession.save();

    // Check if any matched student had recognition confidence below 40%
    for (const rec of records) {
      if (rec.status === 'Present') {
        const isBelow40 = rec.confidence < 40;
        await User.findByIdAndUpdate(rec.student, {
          $set: {
            lastConfidenceScore: rec.confidence,
            photoUpdateRequired: isBelow40
          }
        });
      }
    }

    // Increment classes held count on course
    await Course.findByIdAndUpdate(course._id, { $inc: { totalClassesHeld: 1 } });

    return res.status(201).json({
      success: true,
      message: `Attendance processed successfully! ${totalPresent} out of ${totalEnrolled} students marked present.`,
      session: newSession,
      detections: matchedResults.detections
    });
  } catch (error) {
    console.error('Error processing classroom attendance:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get Teacher's Past Attendance Sessions
exports.getTeacherSessions = async (req, res) => {
  try {
    const teacherId = req.user._id;
    const { courseId } = req.query;
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }

    const teacherCourseIds = await Course.find({
      teacher: teacherId,
      createdByAdmin: tenantAdminId
    }).distinct('_id');
    const query = { teacher: teacherId, course: { $in: teacherCourseIds } };
    if (courseId) {
      query.course = courseId;
    }

    const sessions = await AttendanceSession.find(query)
      .populate('course', 'code title semester standard department')
      .populate('teacher', 'name teacherId email profileImage')
      .populate('records.student', 'name usn profileImage')
      .sort({ sessionDate: -1 });

    return res.json({ success: true, sessions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get Single Attendance Session Detail
exports.getSessionById = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await AttendanceSession.findById(sessionId)
      .populate('course', 'code title department semester')
      .populate('teacher', 'name teacherId email')
      .populate('records.student', 'name usn department profileImage');

    if (!session) {
      return res.status(404).json({ success: false, message: 'Attendance session not found' });
    }
    const tenantAdminId = getTenantAdminId(req.user);
    const courseOwned = tenantAdminId &&
      await Course.exists({ _id: session.course?._id, createdByAdmin: tenantAdminId });
    const canRead = Boolean(courseOwned) && (
      (req.user.role === 'teacher' &&
        session.teacher?._id?.toString() === req.user._id.toString() &&
        isSameInstitution(session, req.user)) ||
      (req.user.role === 'admin' && isSameInstitution(session, req.user))
    );
    if (!canRead) {
      return res.status(403).json({ success: false, message: 'Attendance session access denied.' });
    }

    return res.json({ success: true, session });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Manual Override / Update Attendance Status for a Student
exports.updateStudentRecord = async (req, res) => {
  try {
    const { sessionId, studentId } = req.params;
    const { status } = req.body;

    if (!['Present', 'Absent'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be Present or Absent' });
    }

    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    }
    const session = await AttendanceSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    const courseOwned = await Course.exists({ _id: session.course, createdByAdmin: tenantAdminId });
    const canUpdate = Boolean(courseOwned) && (
      (req.user.role === 'teacher' &&
        session.teacher.toString() === req.user._id.toString() &&
        isSameInstitution(session, req.user)) ||
      (req.user.role === 'admin' && isSameInstitution(session, req.user))
    );
    if (!canUpdate) {
      return res.status(403).json({ success: false, message: 'Attendance session access denied.' });
    }

    const record = session.records.find(r => r.student.toString() === studentId);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Student record not found in this session' });
    }

    record.status = status;
    record.isManuallyOverridden = true;

    // Recalculate summary totals
    session.totalPresent = session.records.filter(r => r.status === 'Present').length;
    session.totalAbsent = session.totalEnrolled - session.totalPresent;
    session.attendancePercentage = session.totalEnrolled > 0 
      ? Math.round((session.totalPresent / session.totalEnrolled) * 100) 
      : 0;

    await session.save();

    return res.json({
      success: true,
      message: `Updated ${record.name}'s status to ${status}`,
      session
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Export Attendance Report as CSV format
exports.exportAttendanceCSV = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await AttendanceSession.findById(sessionId)
      .populate('course', 'code title')
      .populate('teacher', 'name');

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    const tenantAdminId = getTenantAdminId(req.user);
    const courseOwned = tenantAdminId &&
      await Course.exists({ _id: session.course?._id, createdByAdmin: tenantAdminId });
    const canExport = Boolean(courseOwned) && (
      (req.user.role === 'teacher' &&
        session.teacher?._id?.toString() === req.user._id.toString() &&
        isSameInstitution(session, req.user)) ||
      (req.user.role === 'admin' && isSameInstitution(session, req.user))
    );
    if (!canExport) {
      return res.status(403).json({ success: false, message: 'Attendance session access denied.' });
    }

    let csv = `MetricsEdu - Smart Classroom Attendance Report\r\n`;
    csv += `Course: ${session.course ? session.course.code + ' - ' + session.course.title : 'N/A'}\r\n`;
    csv += `Teacher: ${session.teacher ? session.teacher.name : 'N/A'}\r\n`;
    csv += `Date: ${new Date(session.sessionDate).toLocaleDateString()}\r\n`;
    csv += `Classroom: ${session.classroom}\r\n`;
    csv += `Total Enrolled: ${session.totalEnrolled}, Present: ${session.totalPresent}, Absent: ${session.totalAbsent}, Percentage: ${session.attendancePercentage}%\r\n\r\n`;
    csv += `Sl No,USN,Student Name,Status,Match Confidence,Manual Override\r\n`;

    session.records.forEach((rec, idx) => {
      csv += `${idx + 1},${rec.usn},"${rec.name}",${rec.status},${rec.confidence}%,${rec.isManuallyOverridden ? 'Yes' : 'No'}\r\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment(`Attendance_${session.course ? session.course.code : 'Session'}_${Date.now()}.csv`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Check attendance window for a specific course (called by teacher dashboard on load)
exports.checkWindowForCourse = async (req, res) => {
  try {
    const teacherId = req.user._id;
    const { courseId } = req.params;
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId || !(await Course.exists({
      _id: courseId,
      teacher: teacherId,
      createdByAdmin: tenantAdminId
    }))) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this course.' });
    }

    const now = new Date();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[now.getDay()];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const todaySlots = await Timetable.find({
      teacher: teacherId,
      course: courseId,
      day: todayName
    }).populate('course', 'code title');

    if (todaySlots.length === 0) {
      return res.json({
        success: true,
        allowed: false,
        reason: `No class scheduled for this subject on ${todayName}.`,
        todaySlots: []
      });
    }

    let activeSlot = null;
    for (const slot of todaySlots) {
      const startMin = slot.startMinutes || parseTimeToMinutes(slot.timeSlot.split(/[-–]/)[0]);
      const endMin = slot.endMinutes || parseTimeToMinutes((slot.timeSlot.split(/[-–]/)[1] || ''));
      const graceEnd = endMin + 30;
      if (nowMinutes >= startMin && nowMinutes <= graceEnd) {
        activeSlot = slot;
        break;
      }
    }

    if (activeSlot) {
      return res.json({
        success: true,
        allowed: true,
        reason: `Class is live: ${activeSlot.timeSlot} in ${activeSlot.classroom}.`,
        activeSlot,
        todaySlots
      });
    }

    return res.json({
      success: true,
      allowed: false,
      reason: `Outside class window on ${todayName}. Scheduled: ${todaySlots.map(s => s.timeSlot).join(', ')}.`,
      todaySlots
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
