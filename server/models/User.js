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
    trim: true
  },
  teacherId: {
    type: String,
    sparse: true,
    trim: true
  },
  usn: {
    type: String,
    sparse: true,
    trim: true,
    uppercase: true
  },
  // Institution Type: College / University vs School
  institutionType: {
    type: String,
    enum: ['college', 'school'],
    default: 'college'
  },
  // For Schools: Standard / Class (e.g. 1st Std to 12th Std)
  standard: {
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
  semester: {
    type: Number,
    default: 6
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

// Pre-save hook to hash password if modified
userSchema.pre('save', async function () {
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
