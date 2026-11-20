const mongoose = require('mongoose');

const onlineClassSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  courseCode: { type: String, default: '' },
  courseTitle: { type: String, default: '' },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  teacherName: { type: String, default: '' },
  institutionType: {
    type: String,
    enum: ['institute', 'school', 'pu_college', 'diploma', 'college'],
    default: 'institute'
  },
  department: { type: String, default: '' },
  branch: { type: String, default: '' },
  semester: { type: Number, default: null },
  standard: { type: String, default: '' },
  pucYear: { type: String, default: '' },
  pucDept: { type: String, default: '' },
  division: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  timeSlot: {
    type: String,
    default: 'Online Live Class'
  },
  status: {
    type: String,
    enum: ['scheduled', 'live', 'ended'],
    default: 'live'
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
    default: 0
  },
  durationSeconds: {
    type: Number,
    default: 0
  },
  participants: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: String,
    usn: String,
    firstJoinedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    totalSecondsAttended: { type: Number, default: 0 },
    attendancePercentage: { type: Number, default: 0 },
    attendedEightyPercent: { type: Boolean, default: false }
  }],
  chatMessages: [{
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderName: { type: String, default: '' },
    senderRole: { type: String, default: 'student' },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }],
  raisedHands: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    studentName: String,
    raisedAt: { type: Date, default: Date.now }
  }],
  attendanceProcessed: {
    type: Boolean,
    default: false
  },
  attendanceSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceSession',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('OnlineClass', onlineClassSchema);
