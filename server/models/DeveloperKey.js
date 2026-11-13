const mongoose = require('mongoose');

const developerKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  label: {
    type: String,
    required: true,
    trim: true,
    default: 'Core Team Member'
  },
  role: {
    type: String,
    enum: ['lead_developer', 'developer', 'qa_engineer'],
    default: 'developer'
  },
  createdBy: {
    type: String,
    trim: true,
    default: 'Primary Developer'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

developerKeySchema.index({ key: 1, isActive: 1 });

module.exports = mongoose.model('DeveloperKey', developerKeySchema);
