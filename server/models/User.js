const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'teacher', 'student'],
    required: true
  },
  // Role-specific unique identifiers
  adminId: {
    type: String,
    sparse: true,
    unique: true,
    trim: true
  },
  teacherId: {
    type: String,
    sparse: true,
    unique: true,
    trim: true
  },
  usn: {
    type: String,
    sparse: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  // Institution Type: institute | school | pu_college | diploma
  // 'college' kept as legacy alias for 'institute'
  institutionType: {
    type: String,
    enum: ['institute', 'school', 'pu_college', 'diploma', 'college'],
    default: 'institute'
  },
  institutionName: {
    type: String,
    trim: true,
    default: ''
  },
  createdByAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // For Schools: Standard (1st–10th Std)
  standard: {
    type: String,
    trim: true,
    default: ''
  },
  // For PU College: '1st PUC' | '2nd PUC'
  pucYear: {
    type: String,
    trim: true,
    default: ''
  },
  pucDept: {
    type: String,
    trim: true,
    default: ''
  },
  // Parent's Email ID (required for school students, optional for college students)
  parentsEmail: {
    type: String,
    lowercase: true,
    trim: true,
    default: ''
  },
  // Password Reset OTP
  resetPasswordOTP: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  // Educational / Department Details
  department: {
    type: String,
    trim: true,
    default: 'Computer Science & Engineering'
  },
  branch: {
    type: String,
    trim: true,
    default: 'Computer Science & Engineering'
  },
  semester: {
    type: Number,
    default: null
  },
  section: {
    type: String,
    default: 'A'
  },
  division: {
    type: String,
    default: 'A',
    uppercase: true
  },
  divisionAllocated: {
    type: Boolean,
    default: false
  },
  phone: {
    type: String,
    default: ''
  },
  // Face Profile for Students (Used for Automatic Recognition)
  profileImage: {
    type: String,
    default: ''
  },
  faceRegistered: {
    type: Boolean,
    default: false
  },
  faceDescriptor: {
    type: [Number], // 128-dimensional embedding from facial recognition net
    default: []
  },
  faceRegisteredAt: {
    type: Date
  },
  lastConfidenceScore: {
    type: Number,
    default: 95
  },
  photoUpdateRequired: {
    type: Boolean,
    default: false // Set to true when AI recognition drops below 40%
  },
  // Active status
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.index({ createdByAdmin: 1, institutionType: 1, role: 1, branch: 1, semester: 1, division: 1 });
userSchema.index({ createdByAdmin: 1, institutionType: 1, role: 1, standard: 1, division: 1 });
userSchema.index({ createdByAdmin: 1, institutionType: 1, role: 1, pucYear: 1, pucDept: 1, division: 1 });
userSchema.index({ createdByAdmin: 1, institutionType: 1, role: 1, usn: 1, name: 1, createdAt: -1 });

// Pre-save hook to hash password if modified
userSchema.pre('save', async function () {
  if (this.role === 'teacher') this.semester = null;
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to verify password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Safe JSON transform (never leak password or raw raw internal data)
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
