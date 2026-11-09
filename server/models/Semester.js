const mongoose = require('mongoose');

const semesterSchema = new mongoose.Schema({
  // institution type: 'institute' | 'school' | 'pu_college' | 'diploma' | 'college' (legacy)
  institutionType: {
    type: String,
    enum: ['institute', 'school', 'pu_college', 'diploma', 'college'],
    required: true
  },
  // Admin who created this semester config (for strict isolation)
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // ── Institute / Diploma ────────────────────────────────────────────────────
  branch: { type: String, trim: true, default: '' },
  semesterNumber: { type: Number, default: null },  // 1–8 (institute) | 1–6 (diploma)

  // ── School ─────────────────────────────────────────────────────────────────
  standard: { type: String, trim: true, default: '' }, // '1st Std' … '10th Std'

  // ── PU College ─────────────────────────────────────────────────────────────
  pucYear: { type: String, trim: true, default: '' },  // '1st PUC' | '2nd PUC'
  pucDept: { type: String, trim: true, default: '' },  // 'Science' | 'Arts' | 'Commerce'

  // ── Semester dates (mandatory, set by admin before scheduling) ─────────────
  startDate: { type: Date, required: true },
  endDate:   { type: Date, required: true },
  academicYear: { type: String, trim: true, default: '' },  // e.g. '2025-26'

  // ── Status ─────────────────────────────────────────────────────────────────
  isActive: { type: Boolean, default: true },
  // Once locked, only admin can unlock before any edits
  isLocked: { type: Boolean, default: false },
  lockedAt: { type: Date, default: null },

  // ── Subjects (added by admin; drives timetable generation) ─────────────────
  subjects: [
    {
      code:        { type: String, trim: true },
      title:       { type: String, trim: true },
      weeklyHours: { type: Number, default: 4 },
      semesterHours: { type: Number, default: null, min: 0 },
      division: { type: String, trim: true, uppercase: true, default: '' },
      teacher:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    }
  ],

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Semester', semesterSchema);
