const mongoose = require('mongoose');

const academicEventSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  institutionType: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  category: { type: String, enum: ['holiday', 'exam', 'event'], default: 'event' },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true },
  branch: { type: String, trim: true, default: '' },
  semester: { type: Number, default: null },
  standard: { type: String, trim: true, default: '' },
  pucYear: { type: String, trim: true, default: '' },
  pucDept: { type: String, trim: true, default: '' },
  division: { type: String, trim: true, uppercase: true, default: '' }
}, { timestamps: true });

academicEventSchema.index({ adminId: 1, institutionType: 1, startDate: 1 });
academicEventSchema.index({ adminId: 1, startDate: 1 });

module.exports = mongoose.model('AcademicEvent', academicEventSchema);
