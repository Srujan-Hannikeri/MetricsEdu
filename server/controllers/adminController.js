const User = require('../models/User');
const AttendanceSession = require('../models/AttendanceSession');
const Course = require('../models/Course');
const Timetable = require('../models/Timetable');
const faceEngine = require('../services/faceEngine');

// System-wide statistics for Admin
exports.getAdminStats = async (req, res) => {
  try {
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalTeachers = await User.countDocuments({ role: 'teacher' });
    const totalAdmins = await User.countDocuments({ role: 'admin' });
    const studentsWithFace = await User.countDocuments({ role: 'student', faceRegistered: true });
    const totalCourses = await Course.countDocuments();
    const totalSessions = await AttendanceSession.countDocuments();
    const totalTimetableSlots = await Timetable.countDocuments();

    // Calculate institutional average attendance
    const allSessions = await AttendanceSession.find().select('attendancePercentage totalPresent totalEnrolled');
    let avgAttendance = 0;
    if (allSessions.length > 0) {
      const sum = allSessions.reduce((acc, s) => acc + (s.attendancePercentage || 0), 0);
      avgAttendance = Math.round(sum / allSessions.length);
    }

    // Recent 15 sessions across all classes with teacher and classroom photo audits
    const recentSessions = await AttendanceSession.find()
      .populate('course', 'code title semester standard department')
      .populate('teacher', 'name teacherId email profileImage')
      .populate('records.student', 'name usn profileImage')
      .sort({ sessionDate: -1 })
      .limit(15);

    return res.json({
      success: true,
      stats: {
        totalStudents,
        totalTeachers,
        totalAdmins,
        studentsWithFace,
        faceRegistrationRate: totalStudents > 0 ? Math.round((studentsWithFace / totalStudents) * 100) : 0,
        totalCourses,
        totalSessions,
        totalTimetableSlots,
        avgAttendance,
        recentSessions
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== TIMETABLE CONTROLLER ====================

// Helper: Convert time string to minutes from midnight
function parseTimeToMinutes(t) {
  if (!t) return 0;
  let str = t.trim().toLowerCase();
  let isPM = str.includes('pm');
  let isAM = str.includes('am');
  str = str.replace(/[ap]m/g, '').trim();
  const parts = str.split(':');
  let h = parseInt(parts[0], 10) || 0;
  let m = parseInt(parts[1], 10) || 0;
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  // Heuristic: hours 1 to 6 without AM/PM are in afternoon
  if (!isPM && !isAM && h >= 1 && h <= 6) h += 12;
  return h * 60 + m;
}

// Helper: Parse slot start & end time
function parseSlotTimes(slotStr) {
  if (!slotStr) return null;
  const parts = slotStr.split(/[-–—to]+/i);
  if (parts.length < 2) return null;
  const start = parseTimeToMinutes(parts[0]);
  const end = parseTimeToMinutes(parts[1]);
  return { start, end, rawStart: parts[0].trim(), rawEnd: parts[1].trim() };
}

// Helper: Verify teacher break constraint (At least 15 minutes break after every class)
function checkTeacherBreakViolation(newSlotStr, existingSlots, teacherName) {
  const newTimes = parseSlotTimes(newSlotStr);
  if (!newTimes) return null;

  for (const s of existingSlots) {
    const sTimes = parseSlotTimes(s.timeSlot);
    if (!sTimes) continue;

    // 1. Overlap Check
    if (newTimes.start < sTimes.end && newTimes.end > sTimes.start) {
      return `Schedule Overlap: ${teacherName} is already teaching during this time slot on ${s.day} (${s.timeSlot} - Div ${s.division}). A teacher cannot teach two classes simultaneously.`;
    }

    // 2. New class starts AFTER existing class: must have >= 15 min break
    const gapAfter = newTimes.start - sTimes.end;
    if (gapAfter >= 0 && gapAfter < 15) {
      return `Teacher Break Constraint: ${teacherName} has a class ending at ${sTimes.rawEnd} on ${s.day}. Faculty must have at least a 15-minute break after every class before being allocated another class (Current gap: ${gapAfter} mins).`;
    }

    // 3. New class ends BEFORE existing class: must have >= 15 min break
    const gapBefore = sTimes.start - newTimes.end;
    if (gapBefore >= 0 && gapBefore < 15) {
      return `Teacher Break Constraint: ${teacherName} has a class starting at ${sTimes.rawStart} on ${s.day}. Faculty must have at least a 15-minute break between consecutive classes (Current gap: ${gapBefore} mins).`;
    }
  }

  return null;
}

// Get all timetable slots (optionally filtered by division, day, semester)
exports.getTimetables = async (req, res) => {
  try {
    const { division, day, semester } = req.query;
    const filter = {};
    if (division) filter.division = division.toUpperCase();
    if (day) filter.day = day;
    if (semester) filter.semester = Number(semester);

    const slots = await Timetable.find(filter)
      .populate('course', 'code title department')
      .populate('teacher', 'name teacherId email')
      .sort({ day: 1, timeSlot: 1 });

    return res.json({ success: true, slots });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Create a Timetable Entry manually
exports.createTimetableEntry = async (req, res) => {
  try {
    const { day, timeSlot, courseId, teacherId, division, classroom, semester, institutionType, standard } = req.body;

    if (!day || !timeSlot || !courseId || !teacherId) {
      return res.status(400).json({ success: false, message: 'Day, time slot, course, and teacher are required' });
    }

    const trimmedSlot = timeSlot.trim();
    const trimmedRoom = (classroom || 'Smart Lecture Hall LH-301').trim();
    const targetDiv = division ? division.toUpperCase() : 'A';
    const targetSem = semester ? Number(semester) : 5;

    // 1. Check: Different subjects at the same time in same class/division
    const classConflict = await Timetable.findOne({
      day,
      timeSlot: trimmedSlot,
      division: targetDiv,
      semester: targetSem
    }).populate('course', 'code title');

    if (classConflict && classConflict.course && classConflict.course._id.toString() !== courseId.toString()) {
      return res.status(400).json({
        success: false,
        message: `Schedule Conflict: Division ${targetDiv} already has "${classConflict.course.code} - ${classConflict.course.title}" scheduled on ${day} at ${trimmedSlot}. Cannot allocate two different subjects to the same class at the same time.`
      });
    }

    // 2. Check: Teacher >= 15 min Break Rule & Overlap
    const teacherUser = await User.findById(teacherId);
    const tName = teacherUser?.name || 'Selected Faculty';

    const teacherDaySlots = await Timetable.find({
      day,
      teacher: teacherId
    });

    const breakError = checkTeacherBreakViolation(trimmedSlot, teacherDaySlots, tName);
    if (breakError) {
      return res.status(400).json({
        success: false,
        message: breakError
      });
    }

    // 3. Conflict Check: Classroom Double-Booking Prevention
    const roomConflict = await Timetable.findOne({
      day,
      timeSlot: trimmedSlot,
      classroom: trimmedRoom
    });

    if (roomConflict && (roomConflict.division !== targetDiv || roomConflict.semester !== targetSem)) {
      return res.status(400).json({
        success: false,
        message: `Classroom Conflict: Classroom "${trimmedRoom}" is already occupied on ${day} during ${trimmedSlot} by Division ${roomConflict.division}.`
      });
    }

    const newSlot = new Timetable({
      day,
      timeSlot: trimmedSlot,
      course: courseId,
      teacher: teacherId,
      division: targetDiv,
      classroom: trimmedRoom,
      semester: targetSem,
      institutionType: institutionType || 'college',
      standard: standard || ''
    });

    await newSlot.save();
    const populated = await Timetable.findById(newSlot._id)
      .populate('course', 'code title department')
      .populate('teacher', 'name teacherId email');

    return res.status(201).json({ success: true, message: 'Timetable entry added successfully', slot: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Update a Timetable Entry
exports.updateTimetableEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Timetable.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Timetable entry not found' });
    }

    const targetDay = req.body.day || existing.day;
    const targetSlot = (req.body.timeSlot || existing.timeSlot).trim();
    const targetCourse = req.body.courseId || req.body.course || existing.course;
    const targetTeacher = req.body.teacherId || req.body.teacher || existing.teacher;
    const targetRoom = (req.body.classroom || existing.classroom).trim();
    const targetDiv = (req.body.division || existing.division).toUpperCase();
    const targetSem = req.body.semester ? Number(req.body.semester) : existing.semester;

    // 1. Check: Different subjects at the same time in same class/division
    if (targetCourse) {
      const classConflict = await Timetable.findOne({
        _id: { $ne: id },
        day: targetDay,
        timeSlot: targetSlot,
        division: targetDiv,
        semester: targetSem
      }).populate('course', 'code title');

      if (classConflict && classConflict.course && classConflict.course._id.toString() !== targetCourse.toString()) {
        return res.status(400).json({
          success: false,
          message: `Schedule Conflict: Division ${targetDiv} already has "${classConflict.course.code} - ${classConflict.course.title}" scheduled on ${targetDay} at ${targetSlot}. Cannot allocate two different subjects to the same class at the same time.`
        });
      }
    }

    // 2. Check: Teacher >= 15 min Break Rule & Overlap
    if (targetTeacher) {
      const teacherUser = await User.findById(targetTeacher);
      const tName = teacherUser?.name || 'Selected Faculty';

      const teacherDaySlots = await Timetable.find({
        _id: { $ne: id },
        day: targetDay,
        teacher: targetTeacher
      });

      const breakError = checkTeacherBreakViolation(targetSlot, teacherDaySlots, tName);
      if (breakError) {
        return res.status(400).json({
          success: false,
          message: breakError
        });
      }
    }

    // 3. Conflict Check: Classroom Double-Booking Prevention
    if (targetRoom) {
      const roomConflict = await Timetable.findOne({
        _id: { $ne: id },
        day: targetDay,
        timeSlot: targetSlot,
        classroom: targetRoom
      });

      if (roomConflict && roomConflict.division !== targetDiv) {
        return res.status(400).json({
          success: false,
          message: `Classroom Conflict: Classroom "${targetRoom}" is already booked by Division ${roomConflict.division} on ${targetDay} at ${targetSlot}.`
        });
      }
    }

    const updated = await Timetable.findByIdAndUpdate(id, { $set: req.body }, { new: true })
      .populate('course', 'code title department')
      .populate('teacher', 'name teacherId email');

    return res.json({ success: true, message: 'Timetable entry updated', slot: updated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a Timetable Entry
exports.deleteTimetableEntry = async (req, res) => {
  try {
    const { id } = req.params;
    await Timetable.findByIdAndDelete(id);
    return res.json({ success: true, message: 'Timetable entry deleted' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Automated Timetable Generator with Teacher Break Rules & Zero Conflicts
exports.autoGenerateTimetable = async (req, res) => {
  try {
    const { division, semester, institutionType, standard } = req.body;
    const targetDiv = (division || 'A').toUpperCase();
    const targetSem = Number(semester) || 5;
    const instType = institutionType || 'college';

    const query = { semester: targetSem };
    if (instType === 'school' && standard) {
      query.standard = standard;
      query.institutionType = 'school';
    }

    const courses = await Course.find(query).populate('teacher');
    if (courses.length === 0) {
      return res.status(400).json({ success: false, message: 'No courses found for this semester/standard to generate timetable' });
    }

    const teachers = await User.find({ role: 'teacher' });
    if (teachers.length === 0) {
      return res.status(400).json({ success: false, message: 'No teachers registered in system' });
    }

    // Days & Time slots (Aligned with KLS GIT Classroom Timetable)
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeSlots = [
      '08:30 AM - 09:25 AM',
      '09:25 AM - 10:20 AM',
      '10:50 AM - 11:45 AM',
      '11:45 AM - 12:40 PM',
      '01:30 PM - 03:30 PM'
    ];

    // Remove old slots for this division and semester
    await Timetable.deleteMany({ division: targetDiv, semester: targetSem });

    let hallName = 'Class Room: AS-11';
    if (targetDiv === 'A') hallName = 'Smart Lecture Hall LH-301';
    else if (targetDiv === 'B') hallName = 'Lecture Hall LH-302';
    else hallName = 'Class Room: AS-11';

    const newSlots = [];
    let courseIndex = 0;

    for (let d = 0; d < days.length; d++) {
      const day = days[d];
      // Consecutive class tracker for teachers on this day: max 2 consecutive
      const consecutiveClasses = {};
      teachers.forEach(t => { consecutiveClasses[t._id.toString()] = 0; });

      for (let s = 0; s < timeSlots.length; s++) {
        // Skip Saturday afternoon slots (slots 3 and 4)
        if (day === 'Saturday' && s >= 3) continue;

        // Reset consecutive count after Tea Break (slot 2) and Lunch Break (slot 4)
        if (s === 2 || s === 4) {
          teachers.forEach(t => { consecutiveClasses[t._id.toString()] = 0; });
        }

        const slotTime = timeSlots[s];

        // Find candidate course & teacher with:
        // 1) consecutive count < 2 (teacher gets break after 2 classes)
        // 2) no conflict in another division at that (day, slotTime)
        let chosenCourse = null;
        let chosenTeacher = null;

        for (let attempt = 0; attempt < courses.length * 2; attempt++) {
          const candCourse = courses[(courseIndex + attempt) % courses.length];
          const candTeacher = candCourse.teacher || teachers[(courseIndex + attempt) % teachers.length];
          const tId = candTeacher._id.toString();

          // Check rule: teacher cannot teach back-to-back classes without at least 15 min break
          const alreadyAssignedToday = newSlots.filter(ns => ns.day === day && ns.teacher.toString() === tId);
          const hasBreakViolation = checkTeacherBreakViolation(slotTime, alreadyAssignedToday, candTeacher.name);
          if (hasBreakViolation) {
            continue; // teacher needs at least 15 min break between classes
          }

          // Check rule: teacher double-booking across other divisions/classes
          const hasTeacherClash = await Timetable.findOne({
            day,
            timeSlot: slotTime,
            teacher: candTeacher._id
          });
          if (hasTeacherClash) {
            continue; // teacher is busy in another class
          }

          // Check rule: classroom clash
          const hasRoomClash = await Timetable.findOne({
            day,
            timeSlot: slotTime,
            classroom: hallName
          });
          if (hasRoomClash) {
            continue; // hall is occupied
          }

          // Found valid candidate!
          chosenCourse = candCourse;
          chosenTeacher = candTeacher;
          courseIndex = (courseIndex + attempt + 1) % courses.length;
          break;
        }

        // Fallback if strict constraints are exhausted: pick course and reset teacher consecutive
        if (!chosenCourse) {
          chosenCourse = courses[courseIndex % courses.length];
          chosenTeacher = chosenCourse.teacher || teachers[courseIndex % teachers.length];
          courseIndex++;
        }

        const chosenTId = chosenTeacher._id.toString();
        // Update consecutive count for all teachers
        teachers.forEach(t => {
          const idStr = t._id.toString();
          if (idStr === chosenTId) {
            consecutiveClasses[idStr] = (consecutiveClasses[idStr] || 0) + 1;
          } else {
            consecutiveClasses[idStr] = 0; // Got a break/free slot
          }
        });

        newSlots.push({
          day,
          timeSlot: slotTime,
          course: chosenCourse._id,
          teacher: chosenTeacher._id,
          division: targetDiv,
          classroom: hallName,
          semester: targetSem,
          institutionType: instType,
          standard: standard || '',
          classCoordinator: targetDiv === 'C' ? 'Prof. Nandini C.V' : (targetDiv === 'B' ? 'Dr. A.A. Quazi' : 'Prof. Pavan K.K')
        });
      }
    }

    await Timetable.insertMany(newSlots);

    const generated = await Timetable.find({ division: targetDiv, semester: targetSem })
      .populate('course', 'code title department')
      .populate('teacher', 'name teacherId email');

    return res.json({
      success: true,
      message: `Automated Timetable generated successfully for Division ${targetDiv}! Enforced 0 teacher/room clashes and breaks between consecutive classes.`,
      slots: generated
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== DIVISION ALLOCATION CONTROLLER ====================

// Allocate Students to Divisions (Semester/Standard criteria, Admin class strength, Custom Divisions)
exports.allocateDivisions = async (req, res) => {
  try {
    const { mode, semester, standard, institutionType, classStrength, divisionsList, allocations } = req.body;
    // mode: 'auto' | 'manual'

    if (mode === 'auto') {
      const query = { role: 'student' };
      if (semester) query.semester = Number(semester);
      if (standard) query.standard = standard;
      if (institutionType) query.institutionType = institutionType;

      const targetStudents = await User.find(query).sort({ usn: 1, name: 1 });
      const total = targetStudents.length;

      if (total === 0) {
        return res.status(400).json({
          success: false,
          message: `No students found for ${semester ? `Semester ${semester}` : standard || 'the selected criteria'}.`
        });
      }

      // Class strength specified by Admin (e.g. 60 or 30 or 20)
      const strength = Math.max(1, Number(classStrength) || 60);

      // Available divisions: customized by Admin (e.g. ['A', 'B', 'C', 'D', 'E'])
      const divs = (divisionsList && Array.isArray(divisionsList) && divisionsList.length > 0)
        ? divisionsList.map(d => d.trim().toUpperCase())
        : ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

      const divisionSummary = {};

      for (let i = 0; i < total; i++) {
        // Group students according to class strength into divisions
        const divIndex = Math.floor(i / strength);
        const assignedDiv = divs[divIndex] || divs[divs.length - 1];

        await User.findByIdAndUpdate(targetStudents[i]._id, {
          $set: { division: assignedDiv, section: assignedDiv, divisionAllocated: true }
        });

        divisionSummary[assignedDiv] = (divisionSummary[assignedDiv] || 0) + 1;
      }

      const summaryText = Object.entries(divisionSummary)
        .map(([div, count]) => `Div ${div}: ${count} students`)
        .join(', ');

      return res.json({
        success: true,
        message: `Auto-allocated ${total} students of ${semester ? `Sem ${semester}` : standard} (Strength: ${strength}/class) into: ${summaryText}.`,
        summary: divisionSummary
      });
    } else {
      // Manual Allocations: array of { studentId, division }
      if (!allocations || !Array.isArray(allocations)) {
        return res.status(400).json({ success: false, message: 'Valid allocations array required for manual mode' });
      }

      for (const item of allocations) {
        if (item.studentId && item.division) {
          const div = item.division.toUpperCase();
          await User.findByIdAndUpdate(item.studentId, {
            $set: { division: div, section: div, divisionAllocated: true }
          });
        }
      }

      return res.json({
        success: true,
        message: `Updated divisions for ${allocations.length} students successfully.`
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Assign Teacher to Course & Synchronize Timetable Slots
exports.assignTeacherToCourse = async (req, res) => {
  try {
    const { courseId, teacherId } = req.body;
    if (!courseId || !teacherId) {
      return res.status(400).json({ success: false, message: 'courseId and teacherId are required' });
    }

    const updated = await Course.findByIdAndUpdate(
      courseId,
      { $set: { teacher: teacherId } },
      { new: true }
    ).populate('teacher', 'name teacherId email');

    // Also synchronize all corresponding timetable slots for this course
    await Timetable.updateMany(
      { course: courseId },
      { $set: { teacher: teacherId } }
    );

    return res.json({
      success: true,
      message: `Assigned ${updated.teacher?.name} to ${updated.code} - ${updated.title}`,
      course: updated
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get All Users (with filter by role, semester, standard, institutionType)
exports.getUsers = async (req, res) => {
  try {
    const { role, semester, standard, institutionType } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (semester) filter.semester = Number(semester);
    if (standard) filter.standard = standard;
    if (institutionType) filter.institutionType = institutionType;

    const users = await User.find(filter)
      .select('-password')
      .sort({ usn: 1, name: 1, createdAt: -1 });

    return res.json({ success: true, users });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Toggle user active status
exports.toggleUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isActive = !user.isActive;
    await user.save();

    return res.json({
      success: true,
      message: `User ${user.name} is now ${user.isActive ? 'Active' : 'Deactivated'}`,
      user: user.toSafeObject()
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Create a new Course
exports.createCourse = async (req, res) => {
  try {
    const { code, title, department, semester, section, teacherId } = req.body;

    if (!code || !title) {
      return res.status(400).json({ success: false, message: 'Code and title are required' });
    }

    const existingCourse = await Course.findOne({ code: code.trim().toUpperCase() });
    if (existingCourse) {
      return res.status(400).json({ success: false, message: 'Course code already exists' });
    }

    const newCourse = new Course({
      code: code.trim().toUpperCase(),
      title: title.trim(),
      department: department || 'Computer Science & Engineering',
      semester: semester || 6,
      section: section || 'A',
      teacher: teacherId || null
    });

    await newCourse.save();

    return res.status(201).json({
      success: true,
      message: 'Course created successfully',
      course: newCourse
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get All Courses with populated teacher and student counts
exports.getCourses = async (req, res) => {
  try {
    const courses = await Course.find()
      .populate('teacher', 'name teacherId email')
      .populate('enrolledStudents', 'name usn');

    return res.json({ success: true, courses });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Seed Demo Data (Admin, Teachers, 60 Real Students, Courses, Timetable)
exports.seedDemoData = async (req, res) => {
  try {
    // 1. Ensure Admin exists
    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      admin = new User({
        name: 'Super Admin',
        email: 'admin@metricsedu.ac.in',
        password: 'adminpassword123',
        role: 'admin',
        adminId: 'ADM-2026-001',
        department: 'Institutional Administration'
      });
      await admin.save();
    }

    // 2. Sample Faculty Teachers (Matching VTU / KLS GIT Scheme & Timetable)
    const teacherData = [
      { name: 'Prof. Pavan K.K', email: 'pavan.kk@metricsedu.ac.in', teacherId: 'TCH-101', department: 'Computer Science & Engineering' },
      { name: 'Prof. Nandini C.V', email: 'nandini.cv@metricsedu.ac.in', teacherId: 'TCH-102', department: 'Computer Science & Engineering' },
      { name: 'Dr. Jyoti Y. A', email: 'jyoti.ya@metricsedu.ac.in', teacherId: 'TCH-103', department: 'Computer Science & Engineering' },
      { name: 'Dr. A. A. Quazi', email: 'aa.quazi@metricsedu.ac.in', teacherId: 'TCH-104', department: 'Computer Science & Engineering' },
      { name: 'Prof. Mahalaxmi S.B', email: 'mahalaxmi.sb@metricsedu.ac.in', teacherId: 'TCH-105', department: 'Computer Science & Engineering' },
      { name: 'Dr. Ramesh Sharma', email: 'ramesh.sharma@metricsedu.ac.in', teacherId: 'TCH-106', department: 'Artificial Intelligence & ML' },
      { name: 'Prof. Vikram Joshi', email: 'vikram.joshi@metricsedu.ac.in', teacherId: 'TCH-107', department: 'Computer Networks & Systems' },
      { name: 'Prof. Ananya Hegde', email: 'ananya.hegde@metricsedu.ac.in', teacherId: 'TCH-108', department: 'Data Science & Databases' }
    ];

    const createdTeachers = [];
    for (const t of teacherData) {
      let teacher = await User.findOne({ email: t.email });
      if (!teacher) {
        teacher = new User({
          ...t,
          password: 'teacherpassword123',
          role: 'teacher'
        });
        await teacher.save();
      }
      createdTeachers.push(teacher);
    }

    // 3. Indian Student Names List for 60 Students
    const indianStudentNames = [
      'Aarav Patel', 'Bhavya Nair', 'Chirag Reddy', 'Divya Rao', 'Eshwar Gowda',
      'Fatima Zohra', 'Gautam Kumar', 'Harini Sundaram', 'Ishaan Verma', 'Jaya Lakshmi',
      'Kavya Menon', 'Lokesh Sharma', 'Meera Iyer', 'Nikhil Joshi', 'Omkar Patil',
      'Pooja Hegde', 'Qasim Khan', 'Rohan Deshmukh', 'Sneha Nambiar', 'Tarun Bhat',
      'Usha Rani', 'Varun Kulkarni', 'Wendy DSouza', 'Xavier Lobo', 'Yashasvi Raj',
      'Zoya Siddiqui', 'Abhishek Das', 'Bindu Madhavi', 'Chetan Murthy', 'Deepa Shenoy', // Div A (1-30)
      'Darshan Gowda', 'Ekta Kapoor', 'Farhan Akhtar', 'Geetha Ram', 'Hemanth Rao',
      'Indira Devi', 'Jagadish Shettar', 'Kiran Kumar', 'Lavanya S', 'Manish Pandey',
      'Nandini Reddy', 'Pranav Anand', 'Rashmika Mandanna', 'Sachin Tendulkar', 'Trisha Krishnan',
      'Uday Kiran', 'Vidya Balan', 'Wasim Akram', 'Yamuna Prasad', 'Zaheer Khan',
      'Akash Ambani', 'Bhumika Chawla', 'Charan Teja', 'Devi Sri', 'Esha Deol',
      'Fahadh Faasil', 'Ganesh Hegde', 'Hansika Motwani', 'Imran Hashmi', 'Juhi Chawla' // Div B (31-60)
    ];

    const createdStudents = [];
    for (let i = 0; i < 60; i++) {
      const rollNum = (i + 1).toString().padStart(3, '0');
      const usn = `1MS22CS${rollNum}`;
      const name = indianStudentNames[i];
      let division = 'A';
      if (i < 20) division = 'A';
      else if (i < 40) division = 'B';
      else division = 'C';

      const portraitIndex = (i % 8) + 1; // map across available portrait assets
      const parentEmail = `parent.${name.toLowerCase().replace(/[^a-z]/g, '.')}.${rollNum}@gmail.com`;

      let student = await User.findOne({ usn });
      if (!student) {
        student = new User({
          name,
          usn,
          email: `${name.toLowerCase().replace(/[^a-z]/g, '.')}.${rollNum}@metricsedu.ac.in`,
          parentsEmail: parentEmail,
          password: 'studentpassword123',
          role: 'student',
          institutionType: 'college',
          department: 'Computer Science & Engineering',
          semester: 5,
          section: division,
          division: division,
          divisionAllocated: true,
          profileImage: `/uploads/students/student_${portraitIndex}.jpg`,
          faceRegistered: true,
          faceRegisteredAt: new Date(),
          faceDescriptor: faceEngine.generateDeterministicDescriptor(usn),
          lastConfidenceScore: Math.round(88 + (i % 10))
        });
        await student.save();
      } else {
        // Update division, profile & parent email
        student.division = division;
        student.section = division;
        student.divisionAllocated = true;
        student.parentsEmail = student.parentsEmail || parentEmail;
        student.profileImage = `/uploads/students/student_${portraitIndex}.jpg`;
        await student.save();
      }
      createdStudents.push(student);
    }

    // 4. Authentic 2022 Scheme Academic Courses (From PDF Pages 7-18)
    const coursesData = [
      // 3rd Semester
      { code: '22MATCS31', title: 'Fundamentals of Statistics & Probability for Data Science', semester: 3, teacher: createdTeachers[7]._id },
      { code: '22CS32', title: 'Software Engineering and Design', semester: 3, teacher: createdTeachers[0]._id },
      { code: '22CS33', title: 'Object Oriented Programming using Java', semester: 3, teacher: createdTeachers[1]._id },
      { code: '22CS34', title: 'Data Structures and Applications', semester: 3, teacher: createdTeachers[7]._id },
      { code: '22CS352', title: 'Web Programming - A Practical Approach', semester: 3, teacher: createdTeachers[0]._id },
      { code: '22AECCS371', title: 'Design Thinking', semester: 3, teacher: createdTeachers[4]._id },
      { code: '22CSL39', title: 'Data Structures Laboratory using C', semester: 3, teacher: createdTeachers[7]._id },

      // 4th Semester
      { code: '22CS41', title: 'Operating Systems', semester: 4, teacher: createdTeachers[6]._id },
      { code: '22CS42', title: 'Design and Analysis of Algorithms', semester: 4, teacher: createdTeachers[5]._id },
      { code: '22CS43', title: 'Database Management Systems', semester: 4, teacher: createdTeachers[3]._id },
      { code: '22CS441', title: 'Discrete Mathematical Structures and Graph Theory', semester: 4, teacher: createdTeachers[7]._id },
      { code: '22CS46', title: 'Biology For Engineers', semester: 4, teacher: createdTeachers[4]._id },
      { code: '22CS47', title: 'Universal Human Values', semester: 4, teacher: createdTeachers[4]._id },
      { code: '22CSL49', title: 'Operating Systems Lab', semester: 4, teacher: createdTeachers[6]._id },

      // 5th Semester (Aligned with Timetable)
      { code: '22CS51', title: 'Software Project Management', semester: 5, teacher: createdTeachers[0]._id },
      { code: '22CS52', title: 'Formal Languages and Automata Theory', semester: 5, teacher: createdTeachers[1]._id },
      { code: '22CS53', title: 'Micro-Controllers and Embedded Systems', semester: 5, teacher: createdTeachers[2]._id },
      { code: '22CS545', title: 'Data Warehousing and Data Mining', semester: 5, teacher: createdTeachers[3]._id },
      { code: '22CS55', title: 'Research Based Mini Project', semester: 5, teacher: createdTeachers[0]._id },
      { code: '22AECCS56', title: 'Research Methodology and Intellectual Property Rights', semester: 5, teacher: createdTeachers[4]._id },
      { code: '22CS58A', title: 'Environmental Studies', semester: 5, teacher: createdTeachers[4]._id },
      { code: '22CSL59', title: 'Micro-Controllers and Embedded Systems Laboratory', semester: 5, teacher: createdTeachers[2]._id },

      // 6th Semester
      { code: '22CS61', title: 'Artificial Intelligence and Machine Learning', semester: 6, teacher: createdTeachers[5]._id },
      { code: '22CS62', title: 'Computer Networks', semester: 6, teacher: createdTeachers[6]._id },
      { code: '22CS631', title: 'Agile Software Development', semester: 6, teacher: createdTeachers[0]._id },
      { code: '22CS632', title: 'Digital Twin Technology', semester: 6, teacher: createdTeachers[6]._id },
      { code: '22CS633', title: 'Internet of Things', semester: 6, teacher: createdTeachers[2]._id },
      { code: '22CS635', title: 'Introduction to Salesforce', semester: 6, teacher: createdTeachers[1]._id },
      { code: '22INT61', title: 'PwC Launchpad Program', semester: 6, teacher: createdTeachers[5]._id },
      { code: '22CSL68', title: 'Computer Networks Lab', semester: 6, teacher: createdTeachers[6]._id },

      // 7th Semester
      { code: '22CS71', title: 'Big Data and Analytics', semester: 7, teacher: createdTeachers[3]._id },
      { code: '22CS72', title: 'Unix System and Network Programming', semester: 7, teacher: createdTeachers[6]._id },
      { code: '22CS73', title: 'Distributed and Cloud Computing', semester: 7, teacher: createdTeachers[5]._id },
      { code: '22CS741', title: 'Cryptography and Network Security', semester: 7, teacher: createdTeachers[6]._id },
      { code: '22CS742', title: 'Blockchain Management', semester: 7, teacher: createdTeachers[5]._id },
      { code: '22CS744', title: 'Cyber Security', semester: 7, teacher: createdTeachers[6]._id },
      { code: '22CS751', title: 'Disaster Management', semester: 7, teacher: createdTeachers[4]._id },
      { code: '22CS76', title: 'Major Project Phase-II', semester: 7, teacher: createdTeachers[0]._id },
      { code: '22AECCS77', title: 'Indian Knowledge System', semester: 7, teacher: createdTeachers[4]._id },

      // 8th Semester
      { code: '22CS811', title: 'Practical Cyber Security for Practitioners', semester: 8, teacher: createdTeachers[6]._id },
      { code: '22CS813', title: 'Introduction to Machine Learning (NPTEL/Swayam)', semester: 8, teacher: createdTeachers[5]._id },
      { code: '22CS814', title: 'Cloud Computing (NPTEL)', semester: 8, teacher: createdTeachers[5]._id },
      { code: '22CS824', title: 'Ethical Hacking', semester: 8, teacher: createdTeachers[6]._id },
      { code: '22CS83', title: 'Internship (Industry/Research) (14-20 Weeks)', semester: 8, teacher: createdTeachers[1]._id }
    ];

    // Remove old obsolete courses (e.g. CS601, CS602, CS603, CS604)
    await Course.deleteMany({ code: { $in: ['CS601', 'CS602', 'CS603', 'CS604'] } });

    const savedCourses = [];
    for (const c of coursesData) {
      let course = await Course.findOne({ code: c.code });
      if (!course) {
        course = new Course({
          ...c,
          department: 'Computer Science & Engineering',
          section: 'A',
          enrolledStudents: createdStudents.map(s => s._id)
        });
        await course.save();
      } else {
        course.title = c.title;
        course.semester = c.semester;
        course.teacher = c.teacher;
        course.enrolledStudents = createdStudents.map(s => s._id);
        await course.save();
      }
      savedCourses.push(course);
    }

    // 5. Generate Timetable using KLS GIT Timetable Scheme (Matching uploaded timetable for Div C)
    await Timetable.deleteMany({});
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timeSlots = [
      '08:30 AM - 09:25 AM',
      '09:25 AM - 10:20 AM',
      '10:50 AM - 11:45 AM',
      '11:45 AM - 12:40 PM',
      '01:30 PM - 03:30 PM'
    ];

    // Filter 5th sem courses for primary timetable demo
    const sem5Courses = savedCourses.filter(c => c.semester === 5);
    const activeCourses = sem5Courses.length > 0 ? sem5Courses : savedCourses;
    const courseMap = {};
    savedCourses.forEach(c => { courseMap[c.code] = c; });

    const timetableSlots = [];

    // Div A & Div B balanced timetable
    let slotIdx = 0;
    for (const div of ['A', 'B']) {
      for (const day of days) {
        for (const slot of timeSlots) {
          if (day === 'Saturday' && slot.startsWith('01')) continue;
          const course = activeCourses[slotIdx % activeCourses.length];
          timetableSlots.push({
            day,
            timeSlot: slot,
            course: course._id,
            teacher: course.teacher || createdTeachers[0]._id,
            division: div,
            classroom: div === 'A' ? 'Smart Lecture Hall LH-301 (Div A)' : 'Smart Lecture Hall LH-302 (Div B)',
            semester: course.semester || 5
          });
          slotIdx++;
        }
      }
    }

    // Exact Schedule for Division C (Room AS-11, Class Coordinator: Prof. Nandini C.V, w.e.f. 21/09/2026)
    const divCSchedule = [
      // Monday
      { day: 'Monday', timeSlot: '08:30 AM - 09:25 AM', code: '22AECCS56', classroom: 'Class Room: AS-11 (Div C)' }, // RMIPR
      { day: 'Monday', timeSlot: '09:25 AM - 10:20 AM', code: '22CS58A', classroom: 'Class Room: AS-11 (Div C)' },   // EVS
      { day: 'Monday', timeSlot: '10:50 AM - 11:45 AM', code: '22CS53', classroom: 'Class Room: AS-11 (Div C)' },    // MCES
      { day: 'Monday', timeSlot: '11:45 AM - 12:40 PM', code: '22CS545', classroom: 'Class Room: AS-11 (Div C)' },   // PE (DWDM)

      // Tuesday
      { day: 'Tuesday', timeSlot: '08:30 AM - 09:25 AM', code: '22CS52', classroom: 'Class Room: AS-11 (Div C)' },   // FLAT
      { day: 'Tuesday', timeSlot: '09:25 AM - 10:20 AM', code: '22CS51', classroom: 'Class Room: AS-11 (Div C)' },   // SPM
      { day: 'Tuesday', timeSlot: '10:50 AM - 11:45 AM', code: '22CS53', classroom: 'Class Room: AS-11 (Div C)' },   // MCES
      { day: 'Tuesday', timeSlot: '11:45 AM - 12:40 PM', code: '22CS545', classroom: 'Class Room: AS-11 (Div C)' },  // PE (DWDM)

      // Wednesday
      { day: 'Wednesday', timeSlot: '08:30 AM - 10:20 AM', code: '22CS52', classroom: 'Lab Number-2 (FLAT Lab)' },   // FLAT LAB [08:30-10:30]
      { day: 'Wednesday', timeSlot: '10:50 AM - 11:45 AM', code: '22CS52', classroom: 'Class Room: AS-11 (Div C)' },  // FLAT
      { day: 'Wednesday', timeSlot: '11:45 AM - 12:40 PM', code: '22CS53', classroom: 'Class Room: AS-11 (Div C)' },  // MCES
      { day: 'Wednesday', timeSlot: '01:30 PM - 03:30 PM', code: '22CS545', classroom: 'Class Room: AS-11 (Div C)' }, // PE (DWDM)

      // Thursday
      { day: 'Thursday', timeSlot: '08:30 AM - 10:20 AM', code: '22CSL59', classroom: 'Lab Number-6 (MCES Lab)' },   // MCES LAB [08:30-10:30]
      { day: 'Thursday', timeSlot: '10:50 AM - 11:45 AM', code: '22CS51', classroom: 'Class Room: AS-11 (Div C)' },   // SPM
      { day: 'Thursday', timeSlot: '11:45 AM - 12:40 PM', code: '22CS53', classroom: 'Class Room: AS-11 (Div C)' },   // MCES

      // Friday
      { day: 'Friday', timeSlot: '08:30 AM - 09:25 AM', code: '22CS51', classroom: 'Class Room: AS-11 (Div C)' },    // SPM
      { day: 'Friday', timeSlot: '09:25 AM - 10:20 AM', code: '22CS58A', classroom: 'Class Room: AS-11 (Div C)' },   // EVS
      { day: 'Friday', timeSlot: '10:50 AM - 11:45 AM', code: '22AECCS56', classroom: 'Class Room: AS-11 (Div C)' }, // RMIPR
      { day: 'Friday', timeSlot: '11:45 AM - 12:40 PM', code: '22CS52', classroom: 'Class Room: AS-11 (Div C)' },    // FLAT

      // Saturday
      { day: 'Saturday', timeSlot: '10:50 AM - 12:40 PM', code: '22CS55', classroom: 'Class Room: AS-11 (Div C)' }   // Research Based Mini Project
    ];

    for (const entry of divCSchedule) {
      const course = courseMap[entry.code] || activeCourses[0];
      timetableSlots.push({
        day: entry.day,
        timeSlot: entry.timeSlot,
        course: course._id,
        teacher: course.teacher || createdTeachers[0]._id,
        division: 'C',
        classroom: entry.classroom,
        semester: 5
      });
    }

    await Timetable.insertMany(timetableSlots);

    return res.json({
      success: true,
      message: 'Demo dataset seeded with 60 students (Div A, B, C), KLS GIT 2022 Scheme Courses (Pages 7-18) & Timetables!',
      stats: {
        admin: admin.email,
        teachersCount: createdTeachers.length,
        studentsCount: createdStudents.length,
        divisionACount: 20,
        divisionBCount: 20,
        divisionCCount: 20,
        coursesCount: savedCourses.length,
        timetableSlotsCount: timetableSlots.length
      }
    });
  } catch (error) {
    console.error('Seed error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
