const OnlineClass = require('../models/OnlineClass');
const AttendanceSession = require('../models/AttendanceSession');
const Course = require('../models/Course');
const User = require('../models/User');

// In-memory signaling cache for WebRTC offers, answers, and ice candidates
// Format: classId -> [ { id, seq, from, to, type, data, timestamp } ]
const signalQueues = new Map();
const MAX_QUEUE_AGE_MS = 60 * 1000; // 1 minute signal retention
let signalSequenceCounter = 1;

// Periodic cleanup of stale signals
setInterval(() => {
  const now = Date.now();
  for (const [classId, queue] of signalQueues.entries()) {
    const filtered = queue.filter(sig => now - sig.timestamp < MAX_QUEUE_AGE_MS);
    if (filtered.length === 0) {
      signalQueues.delete(classId);
    } else {
      signalQueues.set(classId, filtered);
    }
  }
}, 30000);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Start or Create Online Class (Teacher)
// ─────────────────────────────────────────────────────────────────────────────
exports.startClass = async (req, res) => {
  try {
    const { courseId, division, title, timeSlot } = req.body;
    const teacherId = req.user._id;

    if (!courseId) {
      return res.status(400).json({ success: false, message: 'Course is required to start an online class.' });
    }
    if (!division) {
      return res.status(400).json({ success: false, message: 'Division is required (e.g. Div A, B, C).' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }

    // Check if an active class already exists for this teacher & course & division
    const existingLive = await OnlineClass.findOne({
      course: courseId,
      division: division.toUpperCase().trim(),
      status: 'live'
    });

    if (existingLive) {
      return res.json({
        success: true,
        message: 'Active online class already running for this division.',
        onlineClass: existingLive,
        session: existingLive
      });
    }

    const newClass = new OnlineClass({
      title: title?.trim() || `${course.code} Online Lecture - Div ${division.toUpperCase().trim()}`,
      course: course._id,
      courseCode: course.code,
      courseTitle: course.title,
      teacher: teacherId,
      teacherName: req.user.name,
      institutionType: req.user.institutionType || course.institutionType || 'institute',
      department: req.user.department || course.department || '',
      branch: req.user.branch || course.branch || '',
      semester: course.semester || null,
      standard: course.standard || '',
      pucYear: course.pucYear || '',
      pucDept: course.pucDept || '',
      division: division.toUpperCase().trim(),
      timeSlot: timeSlot || 'Online Live Session',
      status: 'live',
      startedAt: new Date(),
      participants: [],
      chatMessages: [{
        senderId: teacherId,
        senderName: req.user.name,
        senderRole: 'teacher',
        message: `Welcome to the online class for Division ${division.toUpperCase().trim()}! Attendance is automatically recorded for students who attend at least 80% of this session.`,
        timestamp: new Date()
      }]
    });

    await newClass.save();

    return res.status(201).json({
      success: true,
      message: 'Online class started successfully.',
      onlineClass: newClass,
      session: newClass
    });
  } catch (err) {
    console.error('startClass error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Get Active Live Classes (For Students, Teachers, and Admins)
// ─────────────────────────────────────────────────────────────────────────────
exports.getActiveClasses = async (req, res) => {
  try {
    const user = req.user;
    const filter = { status: { $in: ['live', 'active'] } };

    if (user.role === 'student') {
      const requestedDiv = req.query.division ? req.query.division.trim().toUpperCase() : null;
      const userDiv = (user.division || user.section || '').trim().toUpperCase();
      const divToMatch = requestedDiv || userDiv;

      if (divToMatch) {
        // Case-insensitive regex match for division (e.g. 'A', 'B', 'C')
        filter.division = { $regex: new RegExp(`^${divToMatch}$`, 'i') };
      }
    } else if (user.role === 'teacher') {
      filter.teacher = user._id;
    }

    const liveClasses = await OnlineClass.find(filter)
      .populate('course', 'code title department semester standard pucYear')
      .populate('teacher', 'name teacherId email profileImage')
      .sort({ startedAt: -1 })
      .lean();

    return res.json({
      success: true,
      classes: liveClasses,
      sessions: liveClasses,
      session: liveClasses[0] || null
    });
  } catch (err) {
    console.error('getActiveClasses error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Get Class Details (Metadata, participants, chat, hand raises)
// ─────────────────────────────────────────────────────────────────────────────
exports.getClassDetails = async (req, res) => {
  try {
    const { classId } = req.params;
    const onlineClass = await OnlineClass.findById(classId)
      .populate('course', 'code title department semester standard pucYear')
      .populate('teacher', 'name teacherId email profileImage')
      .populate('participants.student', 'name usn profileImage division')
      .lean();

    if (!onlineClass) {
      return res.status(404).json({ success: false, message: 'Online class not found.' });
    }

    return res.json({ success: true, onlineClass, session: onlineClass });
  } catch (err) {
    console.error('getClassDetails error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Join Online Class (Student or Teacher)
// ─────────────────────────────────────────────────────────────────────────────
exports.joinClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const user = req.user;

    const onlineClass = await OnlineClass.findById(classId);
    if (!onlineClass) {
      return res.status(404).json({ success: false, message: 'Online class not found.' });
    }

    if (onlineClass.status === 'ended') {
      return res.status(400).json({ success: false, message: 'This online class has already ended.' });
    }

    // If student, register or update participant record
    if (user.role === 'student') {
      const existingIdx = onlineClass.participants.findIndex(
        p => p.student?.toString() === user._id.toString()
      );

      if (existingIdx >= 0) {
        onlineClass.participants[existingIdx].lastSeenAt = new Date();
      } else {
        onlineClass.participants.push({
          student: user._id,
          name: user.name,
          usn: user.usn || user.rollNo || user.email,
          firstJoinedAt: new Date(),
          lastSeenAt: new Date(),
          totalSecondsAttended: 0,
          attendancePercentage: 0,
          attendedEightyPercent: false
        });
      }
      await onlineClass.save();
    }

    return res.json({
      success: true,
      message: 'Joined class successfully.',
      onlineClass,
      session: onlineClass
    });
  } catch (err) {
    console.error('joinClass error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. WebRTC Signaling: Send Signal (Offer, Answer, ICE Candidate, or Broadcast)
// ─────────────────────────────────────────────────────────────────────────────
exports.sendSignal = async (req, res) => {
  try {
    const { classId } = req.params;
    const { to, type, payload } = req.body;
    const from = req.user._id.toString();
    const fromName = req.user.name;

    if (!signalQueues.has(classId)) {
      signalQueues.set(classId, []);
    }

    const queue = signalQueues.get(classId);
    const signalMsg = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      seq: ++signalSequenceCounter,
      from,
      fromName,
      to: to || 'all',
      type, // 'offer' | 'answer' | 'ice-candidate' | 'user-joined' | 'user-left' | 'screen-share' | 'remote-control' | 'hand-raised'
      payload,
      timestamp: Date.now()
    };

    queue.push(signalMsg);

    // Keep max 300 signals per class
    if (queue.length > 300) {
      queue.splice(0, queue.length - 300);
    }

    return res.json({ success: true, signalId: signalMsg.id, seq: signalMsg.seq });
  } catch (err) {
    console.error('sendSignal error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. WebRTC Signaling: Get Signals (Poll for pending signals with sequential safety)
// ─────────────────────────────────────────────────────────────────────────────
exports.getSignals = async (req, res) => {
  try {
    const { classId } = req.params;
    const userId = req.user._id.toString();
    const sinceSeq = parseInt(req.query.sinceSeq || '0', 10);
    const since = parseInt(req.query.since || '0', 10);

    const queue = signalQueues.get(classId) || [];
    // Deliver signals targeted to this user or to 'all', excluding self
    const signals = queue.filter(sig => {
      const isForMe = sig.from !== userId && (sig.to === 'all' || sig.to === userId);
      if (!isForMe) return false;
      if (sinceSeq > 0) {
        return (sig.seq || 0) > sinceSeq;
      }
      return sig.timestamp > since;
    });

    return res.json({
      success: true,
      signals,
      latestSeq: signalSequenceCounter,
      serverTime: Date.now()
    });
  } catch (err) {
    console.error('getSignals error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. Heartbeat & Live Attendance Meter (Calculates % Attended vs Class Elapsed)
// ─────────────────────────────────────────────────────────────────────────────
exports.heartbeat = async (req, res) => {
  try {
    const { classId } = req.params;
    const user = req.user;

    const onlineClass = await OnlineClass.findById(classId);
    if (!onlineClass) {
      return res.status(404).json({ success: false, message: 'Online class not found.' });
    }

    if (onlineClass.status === 'ended') {
      return res.json({
        success: true,
        classStatus: 'ended',
        attendanceProcessed: onlineClass.attendanceProcessed
      });
    }

    const now = new Date();
    const classElapsedSeconds = Math.max(1, Math.round((now - new Date(onlineClass.startedAt)) / 1000));

    let studentStats = null;

    if (user.role === 'student') {
      let p = onlineClass.participants.find(
        part => part.student?.toString() === user._id.toString()
      );

      if (!p) {
        onlineClass.participants.push({
          student: user._id,
          name: user.name,
          usn: user.usn || user.rollNo || user.email,
          firstJoinedAt: now,
          lastSeenAt: now,
          totalSecondsAttended: 10,
          attendancePercentage: 0,
          attendedEightyPercent: false
        });
        p = onlineClass.participants[onlineClass.participants.length - 1];
      } else {
        const lastSeen = p.lastSeenAt ? new Date(p.lastSeenAt) : now;
        const deltaSeconds = Math.min(15, Math.max(1, Math.round((now - lastSeen) / 1000)));
        p.totalSecondsAttended = (p.totalSecondsAttended || 0) + deltaSeconds;
        p.lastSeenAt = now;
      }

      // Calculate live attendance percentage
      const percentage = Math.min(100, Math.round((p.totalSecondsAttended / classElapsedSeconds) * 100));
      p.attendancePercentage = percentage;
      p.attendedEightyPercent = percentage >= 80;

      studentStats = {
        totalSecondsAttended: p.totalSecondsAttended,
        attendancePercentage: p.attendancePercentage,
        attendedEightyPercent: p.attendedEightyPercent,
        classElapsedSeconds
      };

      await onlineClass.save();
    }

    return res.json({
      success: true,
      classStatus: onlineClass.status,
      elapsedSeconds: classElapsedSeconds,
      activeParticipantCount: onlineClass.participants.length,
      studentStats,
      raisedHands: onlineClass.raisedHands || []
    });
  } catch (err) {
    console.error('heartbeat error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. Live Chat Message
// ─────────────────────────────────────────────────────────────────────────────
exports.sendChatMessage = async (req, res) => {
  try {
    const { classId } = req.params;
    const message = req.body.message || req.body.text;

    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required.' });
    }

    const onlineClass = await OnlineClass.findById(classId);
    if (!onlineClass) {
      return res.status(404).json({ success: false, message: 'Online class not found.' });
    }

    const chatMsg = {
      senderId: req.user._id,
      senderName: req.user.name,
      senderRole: req.user.role,
      message: message.trim(),
      timestamp: new Date()
    };

    onlineClass.chatMessages.push(chatMsg);
    // Keep max 500 messages per session
    if (onlineClass.chatMessages.length > 500) {
      onlineClass.chatMessages.splice(0, onlineClass.chatMessages.length - 500);
    }
    await onlineClass.save();

    // Broadcast chat signal to all peers
    if (!signalQueues.has(classId)) signalQueues.set(classId, []);
    signalQueues.get(classId).push({
      id: `${Date.now()}_chat`,
      seq: ++signalSequenceCounter,
      from: req.user._id.toString(),
      fromName: req.user.name,
      to: 'all',
      type: 'chat-message',
      payload: chatMsg,
      timestamp: Date.now()
    });

    return res.json({ success: true, chatMessage: chatMsg });
  } catch (err) {
    console.error('sendChatMessage error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. Raise / Lower Hand Toggle
// ─────────────────────────────────────────────────────────────────────────────
exports.toggleRaiseHand = async (req, res) => {
  try {
    const { classId } = req.params;
    const user = req.user;
    const targetStudentId = (req.body && req.body.studentId) || user._id.toString();

    const onlineClass = await OnlineClass.findById(classId);
    if (!onlineClass) {
      return res.status(404).json({ success: false, message: 'Online class not found.' });
    }

    if (!onlineClass.raisedHands) {
      onlineClass.raisedHands = [];
    }

    const existingIdx = onlineClass.raisedHands.findIndex(
      rh => (rh.studentId?._id || rh.studentId)?.toString() === targetStudentId.toString()
    );

    let isRaised = false;
    if (existingIdx >= 0) {
      onlineClass.raisedHands.splice(existingIdx, 1);
      isRaised = false;
    } else {
      onlineClass.raisedHands.push({
        studentId: user._id,
        studentName: user.name,
        raisedAt: new Date()
      });
      isRaised = true;
    }

    await onlineClass.save();

    // Broadcast raise-hand signal to everyone in class
    if (!signalQueues.has(classId)) signalQueues.set(classId, []);
    signalQueues.get(classId).push({
      id: `${Date.now()}_hand`,
      seq: ++signalSequenceCounter,
      from: user._id.toString(),
      fromName: user.name,
      to: 'all',
      type: 'hand-raised',
      payload: {
        studentId: targetStudentId.toString(),
        studentName: user.name,
        isRaised
      },
      timestamp: Date.now()
    });

    return res.json({
      success: true,
      isRaised,
      raisedHands: onlineClass.raisedHands
    });
  } catch (err) {
    console.error('toggleRaiseHand error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.lowerHand = async (req, res) => {
  try {
    const { classId } = req.params;
    const studentId = (req.body && req.body.studentId) || req.user._id.toString();

    const onlineClass = await OnlineClass.findById(classId);
    if (!onlineClass) {
      return res.status(404).json({ success: false, message: 'Online class not found.' });
    }

    if (!onlineClass.raisedHands) {
      onlineClass.raisedHands = [];
    }

    onlineClass.raisedHands = onlineClass.raisedHands.filter(
      rh => (rh.studentId?._id || rh.studentId)?.toString() !== studentId.toString()
    );
    await onlineClass.save();

    // Broadcast lower-hand signal to all participants
    if (!signalQueues.has(classId)) signalQueues.set(classId, []);
    signalQueues.get(classId).push({
      id: `${Date.now()}_lower`,
      seq: ++signalSequenceCounter,
      from: req.user._id.toString(),
      fromName: req.user.name,
      to: 'all',
      type: 'hand-raised',
      payload: {
        studentId: studentId.toString(),
        isRaised: false
      },
      timestamp: Date.now()
    });

    return res.json({ success: true, raisedHands: onlineClass.raisedHands });
  } catch (err) {
    console.error('lowerHand error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. End Online Class & Automatically Record Attendance (80% Threshold)
// ─────────────────────────────────────────────────────────────────────────────
exports.endClass = async (req, res) => {
  try {
    const { classId } = req.params;
    const teacherId = req.user._id;

    const onlineClass = await OnlineClass.findById(classId);
    if (!onlineClass) {
      return res.status(404).json({ success: false, message: 'Online class not found.' });
    }

    if (onlineClass.teacher.toString() !== teacherId.toString()) {
      return res.status(403).json({ success: false, message: 'Only the host teacher can end this online class.' });
    }

    const endedAt = new Date();
    const totalDurationSeconds = Math.max(60, Math.round((endedAt - new Date(onlineClass.startedAt)) / 1000));
    const totalDurationMinutes = Math.round(totalDurationSeconds / 60);

    onlineClass.status = 'ended';
    onlineClass.endedAt = endedAt;
    onlineClass.durationSeconds = totalDurationSeconds;
    onlineClass.durationMinutes = totalDurationMinutes;

    // Fetch all enrolled students for this course & division
    // If course.enrolledStudents has students, find those in this division;
    // else query students matching the division and cohort
    const divisionVal = onlineClass.division;
    let studentsInDiv = [];

    const studentFilter = {
      role: 'student',
      division: divisionVal
    };

    if (onlineClass.institutionType) studentFilter.institutionType = onlineClass.institutionType;
    if (onlineClass.standard) studentFilter.standard = onlineClass.standard;
    if (onlineClass.pucYear) studentFilter.pucYear = onlineClass.pucYear;
    if (onlineClass.semester) studentFilter.semester = onlineClass.semester;
    if (onlineClass.department) studentFilter.department = onlineClass.department;

    studentsInDiv = await User.find(studentFilter).select('_id name usn rollNo email division').lean();

    // Fallback if no students strictly match the cohort query, check enrolledStudents on course
    if (studentsInDiv.length === 0) {
      const course = await Course.findById(onlineClass.course).populate('enrolledStudents', '_id name usn rollNo email division');
      if (course && course.enrolledStudents) {
        studentsInDiv = course.enrolledStudents.filter(s => (s.division || 'A').toUpperCase() === divisionVal);
      }
    }

    // Include any student who actually joined the online class even if not in the initial query
    const participantMap = new Map();
    for (const p of onlineClass.participants) {
      if (p.student) {
        participantMap.set(p.student.toString(), p);
      }
    }

    const finalRecords = [];
    let totalPresent = 0;
    let totalAbsent = 0;

    // Evaluate attendance for every student in this division
    const evaluatedIds = new Set();

    for (const student of studentsInDiv) {
      const sId = student._id.toString();
      evaluatedIds.add(sId);
      const participant = participantMap.get(sId);

      const secondsAttended = participant ? (participant.totalSecondsAttended || 0) : 0;
      // Core 80% Rule: student must attain >= 80% of total class duration
      const attendedRatio = secondsAttended / totalDurationSeconds;
      const attendancePercent = Math.min(100, Math.round(attendedRatio * 100));
      const isPresent = attendedRatio >= 0.8;

      if (participant) {
        participant.totalSecondsAttended = secondsAttended;
        participant.attendancePercentage = attendancePercent;
        participant.attendedEightyPercent = isPresent;
      }

      if (isPresent) totalPresent++;
      else totalAbsent++;

      finalRecords.push({
        student: student._id,
        usn: student.usn || student.rollNo || student.email || 'N/A',
        name: student.name,
        status: isPresent ? 'Present' : 'Absent',
        confidence: attendancePercent, // Records attended percentage as confidence
        isManuallyOverridden: false
      });
    }

    // Check if any additional participants joined that were not in studentsInDiv
    for (const [pId, p] of participantMap.entries()) {
      if (!evaluatedIds.has(pId)) {
        const secondsAttended = p.totalSecondsAttended || 0;
        const attendedRatio = secondsAttended / totalDurationSeconds;
        const attendancePercent = Math.min(100, Math.round(attendedRatio * 100));
        const isPresent = attendedRatio >= 0.8;

        p.attendancePercentage = attendancePercent;
        p.attendedEightyPercent = isPresent;

        if (isPresent) totalPresent++;
        else totalAbsent++;

        finalRecords.push({
          student: p.student,
          usn: p.usn || 'N/A',
          name: p.name || 'Student',
          status: isPresent ? 'Present' : 'Absent',
          confidence: attendancePercent,
          isManuallyOverridden: false
        });
      }
    }

    const totalEnrolled = finalRecords.length;
    const overallPercentage = totalEnrolled > 0 ? Math.round((totalPresent / totalEnrolled) * 100) : 0;

    // Automatically create the official AttendanceSession record
    const attendanceSession = new AttendanceSession({
      course: onlineClass.course,
      teacher: teacherId,
      institutionType: onlineClass.institutionType,
      division: divisionVal,
      classroom: 'WebRTC Online Class',
      sessionDate: onlineClass.startedAt,
      timeSlot: onlineClass.timeSlot || 'Online Live Class',
      records: finalRecords,
      totalEnrolled,
      totalPresent,
      totalAbsent,
      attendancePercentage: overallPercentage,
      status: 'Finalized',
      notes: `Automated attendance recorded via WebRTC Online Class. Duration: ${totalDurationMinutes} mins. 80% threshold required for Present status.`
    });

    await attendanceSession.save();

    onlineClass.attendanceProcessed = true;
    onlineClass.attendanceSessionId = attendanceSession._id;
    await onlineClass.save();

    // Broadcast end-class signal so students exit gracefully
    if (!signalQueues.has(classId)) signalQueues.set(classId, []);
    signalQueues.get(classId).push({
      id: `${Date.now()}_ended`,
      seq: ++signalSequenceCounter,
      from: teacherId.toString(),
      fromName: req.user.name,
      to: 'all',
      type: 'class-ended',
      payload: {
        totalDurationMinutes,
        totalPresent,
        totalAbsent,
        attendanceSessionId: attendanceSession._id
      },
      timestamp: Date.now()
    });

    return res.json({
      success: true,
      message: 'Online class ended. Attendance calculated and recorded automatically (80% threshold).',
      summary: {
        totalDurationMinutes,
        totalEnrolled,
        totalPresent,
        totalAbsent,
        overallPercentage,
        attendanceSessionId: attendanceSession._id
      }
    });
  } catch (err) {
    console.error('endClass error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 11. Get Past Online Classes (History)
// ─────────────────────────────────────────────────────────────────────────────
exports.getPastClasses = async (req, res) => {
  try {
    const user = req.user;
    const filter = {};

    if (user.role === 'teacher') {
      filter.teacher = user._id;
    } else if (user.role === 'student') {
      const studentDiv = (user.division || user.section || 'A').toUpperCase().trim();
      filter.division = studentDiv;
      if (user.institutionType) filter.institutionType = user.institutionType;
    }

    const pastClasses = await OnlineClass.find(filter)
      .populate('course', 'code title')
      .populate('teacher', 'name teacherId')
      .sort({ startedAt: -1 })
      .limit(30)
      .lean();

    return res.json({
      success: true,
      classes: pastClasses,
      sessions: pastClasses
    });
  } catch (err) {
    console.error('getPastClasses error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
