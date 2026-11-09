const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  department: { type: String, default: 'Computer Science & Engineering' },
  branch:     { type: String, default: 'Computer Science & Engineering' },
  semester:   { type: Number, default: 5 },
  semesterHours: { type: Number, default: null, min: 0 },
  institutionType: {
    type: String,
    enum: ['institute', 'school', 'pu_college', 'diploma', 'college'],
    default: 'institute'
  },
  standard:  { type: String, default: '' },  // school
  pucYear:   { type: String, default: '' },  // pu_college
  pucDept:   { type: String, default: '' },  // pu_college dept
  section:   { type: String, default: '' },
  // Semester ref for locking/unlocking
  semesterRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Semester',
    default: null
  },
  // Admin who created this course
  createdByAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  enrolledStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  totalClassesHeld: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Course', courseSchema);
