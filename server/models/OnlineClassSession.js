const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  usn: {
    type: String,
    default: ''
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  lastPingAt: {
    type: Date,
    default: Date.now
  },
  secondsAttended: {
    type: Number,
    default: 0
  },
  attendancePercentage: {
    type: Number,
    default: 0
  },
  isQualified: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'In Progress'],
    default: 'In Progress'
  },
  handRaised: {
    type: Boolean,
    default: false
  },
  handRaisedAt: {
    type: Date
  }
});

const messageSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true
  },
  senderId: {
    type: String,
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  senderRole: {
    type: String,
    enum: ['teacher', 'student', 'admin'],
    default: 'student'
  },
  text: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const signalSchema = new mongoose.Schema({
  fromId: {
    type: String,
    required: true
  },
  toId: {
    type: String,
    default: 'all'
  },
  type: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600 // auto-cleanup signals after 1 hour
  }
});

const onlineClassSessionSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  courseCode: {
    type: String,
    required: true
  },
  courseTitle: {
    type: String,
    required: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  teacherName: {
    type: String,
    required: true
  },
  division: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  semester: {
    type: Number,
    default: 5
  },
  department: {
    type: String,
    default: 'Computer Science & Engineering'
  },
  institutionType: {
    type: String,
    enum: ['institute', 'school', 'pu_college', 'diploma', 'college'],
    default: 'institute'
  },
  title: {
    type: String,
    default: 'Live Online Lecture'
  },
  status: {
    type: String,
    enum: ['active', 'ended'],
    default: 'active'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date
  },
  durationMinutes: {
    type: Number,
    default: 45
  },
  totalDurationSeconds: {
    type: Number,
    default: 0
  },
  attendanceThresholdPercent: {
    type: Number,
    default: 80 // Automatic attendance qualification threshold
  },
  participants: [participantSchema],
  messages: [messageSchema],
  signals: [signalSchema],
  attendanceSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceSession'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('OnlineClassSession', onlineClassSessionSchema);
