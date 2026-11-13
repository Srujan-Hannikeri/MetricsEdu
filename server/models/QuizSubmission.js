const mongoose = require('mongoose');

const quizSubmissionSchema = new mongoose.Schema({
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LearningPost',
    required: true,
    index: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  studentName: {
    type: String,
    required: true,
    trim: true
  },
  studentUsn: {
    type: String,
    trim: true,
    default: ''
  },
  studentEmail: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  answers: [{
    questionIndex: { type: Number, required: true },
    selectedOption: { type: String, default: '' },
    isCorrect: { type: Boolean, default: false }
  }],
  score: {
    type: Number,
    required: true,
    default: 0
  },
  totalQuestions: {
    type: Number,
    required: true,
    default: 0
  },
  percentage: {
    type: Number,
    required: true,
    default: 0
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

quizSubmissionSchema.index({ post: 1, student: 1 }, { unique: true });
quizSubmissionSchema.index({ post: 1, score: -1 });

module.exports = mongoose.model('QuizSubmission', quizSubmissionSchema);
