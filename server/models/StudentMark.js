const mongoose = require('mongoose');

const studentMarkSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  institutionType: {
    type: String,
    enum: ['institute', 'school', 'pu_college', 'diploma', 'college'],
    default: 'institute'
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null,
    index: true
  },
  courseCode: {
    type: String,
    default: 'GENERAL',
    trim: true,
    uppercase: true
  },
  courseTitle: {
    type: String,
    default: 'General Assessment',
    trim: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  teacherName: {
    type: String,
    default: ''
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  studentName: {
    type: String,
    required: true
  },
  studentUsn: {
    type: String,
    default: '',
    uppercase: true
  },
  division: {
    type: String,
    default: 'A',
    uppercase: true
  },
  semester: {
    type: Number,
    default: null
  },
  branch: {
    type: String,
    default: ''
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
  assessmentName: {
    type: String,
    required: true,
    trim: true
  },
  assessmentType: {
    type: String,
    enum: ['internal', 'midterm', 'quiz', 'assignment', 'lab', 'final', 'other'],
    default: 'internal'
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  maxScore: {
    type: Number,
    required: true,
    min: 1,
    default: 100
  },
  percentage: {
    type: Number,
    default: 0
  },
  grade: {
    type: String,
    default: 'P'
  },
  status: {
    type: String,
    enum: ['Present', 'Absent', 'Exempted'],
    default: 'Present'
  },
  remarks: {
    type: String,
    default: '',
    trim: true
  },
  examDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure a student has at most one mark per course and assessment
studentMarkSchema.index({ student: 1, course: 1, assessmentName: 1 }, { unique: true });
studentMarkSchema.index({ adminId: 1, course: 1, division: 1 });
studentMarkSchema.index({ student: 1, examDate: -1 });

// Helper to compute grade from percentage
studentMarkSchema.statics.calculateGrade = function(score, maxScore, status = 'Present') {
  if (status === 'Absent') return { percentage: 0, grade: 'AB' };
  if (status === 'Exempted') return { percentage: 0, grade: 'EX' };
  const pct = Math.max(0, Math.min(100, Math.round(((score / maxScore) * 100) * 10) / 10));
  let grade = 'F';
  if (pct >= 90) grade = 'A+';
  else if (pct >= 80) grade = 'A';
  else if (pct >= 70) grade = 'B+';
  else if (pct >= 60) grade = 'B';
  else if (pct >= 50) grade = 'C';
  else if (pct >= 40) grade = 'P';
  return { percentage: pct, grade };
};

module.exports = mongoose.model('StudentMark', studentMarkSchema);
