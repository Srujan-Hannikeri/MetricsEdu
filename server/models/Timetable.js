const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    required: true
  },
  timeSlot: {
    type: String,
    required: true,
    trim: true
  },
  // Start/end minutes from midnight for quick overlap checks
  startMinutes: { type: Number, default: 0 },
  endMinutes: { type: Number, default: 0 },
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
  division: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    default: 'A'
  },
  classroom: {
    type: String,
    default: 'Smart Lecture Hall LH-301'
  },
  semester: {
    type: Number,
    default: 5
  },
  branch: {
    type: String,
    trim: true,
    default: 'Computer Science & Engineering'
  },
  institutionType: {
    type: String,
    enum: ['institute', 'school', 'pu_college', 'diploma', 'college'],
    default: 'institute'
  },
  standard: {
    type: String,
    default: ''
  },
  pucYear: {
    type: String,
    default: ''
  },
  pucDept: {
    type: String,
    default: ''
  },
  // School: standard number for ordering
  classCoordinator: {
    type: String,
    default: 'Prof. Nandini C.V'
  },
  isLocked: {
    type: Boolean,
    default: true
  },
  department: {
    type: String,
    default: 'Computer Science & Engineering'
  },
  // Ref to the Semester document that produced this schedule
  semesterRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Semester',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Timetable', timetableSchema);
