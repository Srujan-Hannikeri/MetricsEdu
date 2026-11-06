const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    default: 'Computer Science & Engineering'
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
  section: {
    type: String,
    default: 'A'
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  enrolledStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  totalClassesHeld: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Course', courseSchema);
