const AttendanceSession = require('../models/AttendanceSession');
const Course = require('../models/Course');
const User = require('../models/User');
const faceEngine = require('../services/faceEngine');

// Get list of courses assigned to the logged-in teacher
exports.getTeacherCourses = async (req, res) => {
  try {
    const teacherId = req.user._id;
    let courses = await Course.find({ teacher: teacherId }).populate('enrolledStudents', 'name usn department semester faceRegistered profileImage');
    
    // If no course explicitly assigned yet, find courses by department or provide all active courses
    if (courses.length === 0) {
      courses = await Course.find().populate('enrolledStudents', 'name usn department semester faceRegistered profileImage');
    }

    return res.json({ success: true, courses });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get all enrolled students for a specific course (including face registration status)
exports.getCourseStudents = async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findById(courseId).populate('enrolledStudents', 'name usn email department semester section faceRegistered profileImage faceDescriptor');
    
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    let students = course.enrolledStudents;

    // If no enrolled students in this specific course record, fallback to students of the same semester/dept
    if (!students || students.length === 0) {
      students = await User.find({
        role: 'student',
        $or: [
          { department: course.department, semester: course.semester },
          { role: 'student' } // include all registered students for ease of classroom testing
        ]
      }).select('name usn email department semester section faceRegistered profileImage faceDescriptor');
    }

    return res.json({
      success: true,
      course: {
        id: course._id,
        code: course.code,
        title: course.title,
        classroom: course.section
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
    const teacherId = req.user._id;
    const { courseId, classroom, sessionDate, notes, timeSlot, teacherPhoto } = req.body;
    
    let photoUrl = '';
    let teacherPhotoUrl = teacherPhoto || '';

    if (req.file) {
      photoUrl = `/uploads/classroom/${req.file.filename}`;
    }
    if (req.files) {
      if (Array.isArray(req.files)) {
        req.files.forEach(f => {
          if (f.fieldname === 'classroomPhoto') photoUrl = `/uploads/classroom/${f.filename}`;
          if (f.fieldname === 'teacherPhoto') teacherPhotoUrl = `/uploads/classroom/${f.filename}`;
        });
      } else {
        if (req.files['classroomPhoto']) photoUrl = `/uploads/classroom/${req.files['classroomPhoto'][0].filename}`;
        if (req.files['teacherPhoto']) teacherPhotoUrl = `/uploads/classroom/${req.files['teacherPhoto'][0].filename}`;
      }
    }
    if (!photoUrl) {
      photoUrl = req.body.classroomPhoto || req.body.samplePhotoUrl || '/classroom_60_divA.jpg';
    }

    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Course ID is required' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Fetch enrolled students
    let enrolledStudents = await User.find({
      $or: [
        { _id: { $in: course.enrolledStudents } },
        { role: 'student' } // fallback to all students if enrollment isn't locked
      ]
    });

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

    const query = { teacher: teacherId };
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

    const session = await AttendanceSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
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
