const mongoose = require('mongoose');
const User = require('./models/User');

async function checkStudent() {
  await mongoose.connect('mongodb://127.0.0.1:27017/metricsedu');
  const student = await User.findOne({ role: 'student' });
  console.log('Sample student:', {
    name: student.name,
    email: student.email,
    usn: student.usn,
    division: student.division,
    semester: student.semester
  });
  process.exit(0);
}

checkStudent();
