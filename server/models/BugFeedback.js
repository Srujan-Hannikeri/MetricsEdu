const mongoose = require('mongoose');

const bugFeedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  userName: {
    type: String,
    trim: true,
    default: 'Anonymous User'
  },
  userEmail: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  userRole: {
    type: String,
    enum: ['admin', 'teacher', 'student', 'anonymous', 'developer'],
    default: 'anonymous'
  },
  institutionName: {
    type: String,
    trim: true,
    default: 'Unspecified'
  },
  institutionType: {
    type: String,
    trim: true,
    default: ''
  },
  type: {
    type: String,
    enum: ['bug', 'feedback', 'feature'],
    default: 'bug'
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'investigating', 'resolved', 'closed'],
    default: 'open'
  },
  devNotes: {
    type: String,
    trim: true,
    default: ''
  },
  attachmentUrl: {
    type: String,
    default: ''
  }
}, { timestamps: true });

bugFeedbackSchema.index({ status: 1, createdAt: -1 });
bugFeedbackSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('BugFeedback', bugFeedbackSchema);
