const mongoose = require('mongoose');

const learningPostSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  institutionType: { type: String, required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole: { type: String, enum: ['admin', 'teacher'], required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
  type: { type: String, enum: ['announcement', 'material', 'quiz'], required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  body: { type: String, trim: true, maxlength: 10000, default: '' },
  attachmentUrl: { type: String, trim: true, default: '' },
  questions: [{
    prompt: { type: String, required: true, trim: true, maxlength: 1000 },
    options: [{ type: String, trim: true, maxlength: 500 }],
    correctAnswer: { type: String, trim: true, maxlength: 500 }
  }]
}, { timestamps: true });

module.exports = mongoose.model('LearningPost', learningPostSchema);
