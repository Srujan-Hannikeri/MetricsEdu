/**
 * Simulates the exact login flow for all 3 demo accounts
 * Run with: node test_login_flow.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/metricsedu').then(async () => {
  const User = require('./models/User');
  const Timetable = require('./models/Timetable');
  const Course = require('./models/Course');

  const credentials = [
    { id: 'ADM-INST-001', pw: 'adminpassword123',   role: 'admin',   type: 'Institute Admin' },
    { id: 'ADM-SCH-001',  pw: 'adminpassword123',   role: 'admin',   type: 'School Admin' },
    { id: 'ADM-PUC-001',  pw: 'adminpassword123',   role: 'admin',   type: 'PU College Admin' },
    { id: 'ADM-DIP-001',  pw: 'adminpassword123',   role: 'admin',   type: 'Diploma Admin' },
    { id: 'TCH-101',      pw: 'teacherpassword123',  role: 'teacher', type: 'Teacher' },
    { id: 'TCH-SCH-01',   pw: 'teacherpassword123',  role: 'teacher', type: 'School Teacher' },
    { id: 'TCH-PUC-SCI-01', pw: 'teacherpassword123', role: 'teacher', type: 'PU College Teacher' },
    { id: 'TCH-DIPLOMA-DCS-01', pw: 'teacherpassword123', role: 'teacher', type: 'Diploma Teacher' },
    { id: '1MS22CS001',   pw: 'studentpassword123',  role: 'student', type: 'Student' },
    { id: 'SCH-10-001',   pw: 'studentpassword123', role: 'student', type: 'School Student' },
    { id: 'PUC-1PUC-S-001', pw: 'studentpassword123', role: 'student', type: 'PU College Student' },
    { id: 'DIP-DCS-001',  pw: 'studentpassword123', role: 'student', type: 'Diploma Student' },
  ];

  console.log('=== LOGIN FLOW TEST ===\n');
  const failures = [];
  for (const cred of credentials) {
    const user = await User.findOne({
      $or: [{ adminId: cred.id }, { teacherId: cred.id }, { usn: cred.id }],
      role: cred.role
    });
    if (!user) {
      console.log(`❌ ${cred.type} (${cred.id}): NOT FOUND`);
      failures.push(`${cred.type} account was not found`);
      continue;
    }
    const pwOk = await user.comparePassword(cred.pw);
    const activeOk = user.isActive !== false;
    console.log(`${pwOk && activeOk ? '✅' : '❌'} ${cred.type} (${cred.id}): pw=${pwOk ? 'OK' : 'FAIL'} active=${activeOk} type=${user.institutionType}`);
    if (!pwOk || !activeOk) failures.push(`${cred.type} account failed login validation`);
  }

  console.log('\n=== TIMETABLE QUERY TEST ===\n');
  const slots = await Timetable.find({
    semester: 5,
    division: 'A',
    branch: 'Computer Science & Engineering',
    institutionType: 'institute'
  }).populate('course', 'code title').populate('teacher', 'name');
  console.log(`Timetable (sem 5, div A, CSE): ${slots.length} slots`);
  if (slots[0]) console.log(`  Sample: ${slots[0].day} ${slots[0].timeSlot} — ${slots[0].course?.code} — ${slots[0].teacher?.name}`);
  if (slots.length === 0) failures.push('Institute timetable query returned no slots');

  const allSlots = await Timetable.countDocuments({ semester: 5, institutionType: 'institute' });
  console.log(`Total institute sem 5 slots (all divs): ${allSlots}`);

  console.log('\n=== COURSES TEST ===\n');
  const courses = await Course.find({ semester: 5, institutionType: 'institute' }).populate('teacher', 'name teacherId');
  console.log(`Courses (sem 5): ${courses.length}`);
  const unassignedCourses = courses.filter(course => !course.teacher);
  if (courses.length === 0) failures.push('Institute course query returned no courses');
  if (unassignedCourses.length) failures.push(`${unassignedCourses.length} institute courses have no teacher`);

  await mongoose.disconnect();
  if (failures.length) {
    console.error('\nFAILED:', failures.join('; '));
    process.exitCode = 1;
  } else {
    console.log('\nAll login, timetable, and course checks passed.');
  }
}).catch(e => { console.error('ERROR:', e.message); process.exit(1); });
