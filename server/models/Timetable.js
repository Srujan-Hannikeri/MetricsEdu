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
  institutionType: {
    type: String,
    enum: ['college', 'school'],
    default: 'college'
  },
  standard: {
    type: String,
    default: ''
  },
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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Timetable', timetableSchema);
