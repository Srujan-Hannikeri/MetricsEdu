const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  usn: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Present', 'Absent'],
    default: 'Absent'
  },
  confidence: {
    type: Number,
    default: 0
  },
  detectedBox: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 }
  },
  isManuallyOverridden: {
    type: Boolean,
    default: false
  }
});

const attendanceSessionSchema = new mongoose.Schema({
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  institutionType: {
    type: String,
    enum: ['institute', 'school', 'pu_college', 'diploma', 'college'],
    required: true
  },
  division: {
    type: String,
    trim: true,
    uppercase: true,
    default: ''
  },
  classroom: {
    type: String,
    default: 'Smart Classroom A-101'
  },
  sessionDate: {
    type: Date,
    default: Date.now
  },
  classPhoto: {
    type: String,
    default: ''
  },
  teacherPhoto: {
    type: String,
    default: ''
  },
  teacherAttendanceStatus: {
    type: String,
    enum: ['Present', 'Absent'],
    default: 'Present'
  },
  timeSlot: {
    type: String,
    default: '08:30 AM - 09:25 AM'
  },
  detectedFacesCount: {
    type: Number,
    default: 0
  },
  matchedStudentsCount: {
    type: Number,
    default: 0
  },
  records: [attendanceRecordSchema],
  totalEnrolled: {
    type: Number,
    default: 0
  },
  totalPresent: {
    type: Number,
    default: 0
  },
  totalAbsent: {
    type: Number,
    default: 0
  },
  attendancePercentage: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Draft', 'Finalized'],
    default: 'Finalized'
  },
  notes: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);
