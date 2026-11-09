const User = require('../models/User');
const AttendanceSession = require('../models/AttendanceSession');
const Course = require('../models/Course');
const { getStudentCohortFilter } = require('../config/institutions');
const { saveUploadedFile } = require('../services/uploadService');

// Register or Update Student Face Embedding
exports.registerFace = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { faceDescriptor } = req.body;
    let profileImagePath = req.body.profileImageUrl || '';

    if (req.file) {
      profileImagePath = await saveUploadedFile(req.file, 'students');
    }

    // Ensure faceDescriptor is valid array of numbers
    let parsedDescriptor = [];
    if (typeof faceDescriptor === 'string') {
      try {
        parsedDescriptor = JSON.parse(faceDescriptor);
      } catch (e) {
        parsedDescriptor = [];
      }
    } else if (Array.isArray(faceDescriptor)) {
      parsedDescriptor = faceDescriptor;
    }

    if (!parsedDescriptor || parsedDescriptor.length !== 128) {
      return res.status(400).json({
        success: false,
        message: 'Valid 128-dimensional face descriptor is required for facial recognition.'
      });
    }

    const updateFields = {
      faceRegistered: true,
      faceDescriptor: parsedDescriptor,
      faceRegisteredAt: new Date(),
      photoUpdateRequired: false,
      lastConfidenceScore: 96
    };

    if (profileImagePath) {
      updateFields.profileImage = profileImagePath;
    }

    const updatedStudent = await User.findByIdAndUpdate(
      studentId,
      { $set: updateFields },
      { new: true }
    );

    return res.json({
      success: true,
      message: 'Facial recognition profile registered successfully!',
      user: updatedStudent.toSafeObject()
    });
  } catch (error) {
    console.error('Face registration error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Get Student Dashboard Metrics & Attendance Summary
exports.getStudentDashboard = async (req, res) => {
  try {
    const studentId = req.user._id;
    const student = await User.findById(studentId);

    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    if (!student.createdByAdmin) {
      return res.status(403).json({ success: false, message: 'Student is not assigned to an institution.' });
    }

    const courseFilter = {
      ...getStudentCohortFilter(student),
      createdByAdmin: student.createdByAdmin,
      section: (student.section || student.division || 'A').toUpperCase()
    };
    const courses = await Course.find(courseFilter)
      .populate('teacher', 'name teacherId email');
    const courseIds = courses.map(course => course._id);

    // Find all attendance sessions containing this student
    const sessions = await AttendanceSession.find({
      'records.student': studentId,
      course: { $in: courseIds }
    }).populate('course', 'code title').populate('teacher', 'name').sort({ sessionDate: -1 });

    // Compute subject-wise attendance breakdown
    const subjectBreakdown = courses.map(course => {
      const courseSessions = sessions.filter(
        s => s.course && s.course._id.toString() === course._id.toString()
      );
      const totalHeld = courseSessions.length;
      let totalAttended = 0;

      courseSessions.forEach(s => {
        const rec = s.records.find(r => r.student.toString() === studentId.toString());
        if (rec && rec.status === 'Present') {
          totalAttended += 1;
        }
      });

      const percentage = totalHeld > 0 ? Math.round((totalAttended / totalHeld) * 100) : 100;

      return {
        courseId: course._id,
        code: course.code,
        title: course.title,
        teacher: course.teacher ? course.teacher.name : 'Faculty Member',
        totalHeld,
        totalAttended,
        totalAbsent: totalHeld - totalAttended,
        percentage,
        isLowAttendance: percentage < 75
      };
    });

    // Calculate overall stats
    let totalClasses = 0;
    let attendedClasses = 0;
    subjectBreakdown.forEach(sub => {
      totalClasses += sub.totalHeld;
      attendedClasses += sub.totalAttended;
    });

    const overallPercentage = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : 100;

    // Detailed recent logs
    const recentLogs = sessions.slice(0, 15).map(s => {
      const rec = s.records.find(r => r.student.toString() === studentId.toString());
      return {
        sessionId: s._id,
        date: s.sessionDate,
        courseCode: s.course ? s.course.code : 'GEN',
        courseTitle: s.course ? s.course.title : 'General Lecture',
        teacherName: s.teacher ? s.teacher.name : 'Lecturer',
        classroom: s.classroom,
        status: rec ? rec.status : 'Absent',
        confidence: rec ? rec.confidence : 0
      };
    });

    return res.json({
      success: true,
      metrics: {
        student: student.toSafeObject(),
        overallPercentage,
        totalClasses,
        attendedClasses,
        missedClasses: totalClasses - attendedClasses,
        isWarning: overallPercentage < 75,
        photoUpdateRequired: student.photoUpdateRequired || false,
        lastConfidenceScore: student.lastConfidenceScore || 95,
        subjects: subjectBreakdown,
        recentLogs
      }
    });
  } catch (error) {
    console.error('Error fetching student dashboard:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
