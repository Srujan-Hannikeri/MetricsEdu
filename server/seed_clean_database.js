// server/seed_clean_database.js
// Complete clean database reset and accurate Semester-wise (College) and Standard-wise (School) seeding
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Course = require('./models/Course');
const Timetable = require('./models/Timetable');
const AttendanceSession = require('./models/AttendanceSession');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/metricsedu';

async function seedCleanDatabase() {
  console.log('🚀 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB.');

  console.log('🗑️  Deleting previous data across all collections...');
  await User.deleteMany({});
  await Course.deleteMany({});
  await Timetable.deleteMany({});
  await AttendanceSession.deleteMany({});
  console.log('✅ Clean slate achieved: 0 users, 0 courses, 0 timetables, 0 sessions.');

  // Pass plain text so userSchema.pre('save') hashes each password once
  const adminPassword = 'adminpassword123';
  const teacherPassword = 'teacherpassword123';
  const studentPassword = 'studentpassword123';

  // 1. Create Admins (Institutional vs School)
  console.log('👤 Creating Admins...');
  const collegeAdmin = await User.create({
    name: 'Super Admin (Institutional)',
    email: 'admin@metricsedu.ac.in',
    password: adminPassword,
    role: 'admin',
    adminId: 'ADM-2026-001',
    institutionType: 'college',
    institutionName: 'KLS Gogte Institute of Technology',
    department: 'Administration',
    faceRegistered: true
  });

  const schoolAdmin = await User.create({
    name: 'School Principal (K-12)',
    email: 'schooladmin@metricsedu.ac.in',
    password: adminPassword,
    role: 'admin',
    adminId: 'ADM-SCH-001',
    institutionType: 'school',
    institutionName: 'MetricsEdu Model High School',
    department: 'School Board',
    faceRegistered: true
  });

  // 2. Create Faculty Teachers (College)
  console.log('👨‍🏫 Creating College Faculty Teachers...');
  const teachersData = [
    { name: 'Prof. Nandini C.V', email: 'nandini.cv@metricsedu.ac.in', teacherId: 'TCH-101', role: 'teacher', institutionType: 'college', department: 'Computer Science & Engineering', profileImage: '/students/student_1.jpg' },
    { name: 'Prof. Pavan K.K', email: 'pavan.kk@metricsedu.ac.in', teacherId: 'TCH-102', role: 'teacher', institutionType: 'college', department: 'Computer Science & Engineering', profileImage: '/students/student_2.jpg' },
    { name: 'Dr. Jyoti Y. A', email: 'jyoti.ya@metricsedu.ac.in', teacherId: 'TCH-103', role: 'teacher', institutionType: 'college', department: 'Computer Science & Engineering', profileImage: '/students/student_3.jpg' },
    { name: 'Dr. A.A. Quazi', email: 'quazi.aa@metricsedu.ac.in', teacherId: 'TCH-104', role: 'teacher', institutionType: 'college', department: 'Computer Science & Engineering', profileImage: '/students/student_4.jpg' },
    { name: 'Prof. Mahalaxmi S.B', email: 'mahalaxmi.sb@metricsedu.ac.in', teacherId: 'TCH-105', role: 'teacher', institutionType: 'college', department: 'Computer Science & Engineering', profileImage: '/students/student_5.jpg' },
    { name: 'Prof. Pradeep N.K', email: 'pradeep.nk@metricsedu.ac.in', teacherId: 'TCH-106', role: 'teacher', institutionType: 'college', department: 'Computer Science & Engineering', profileImage: '/students/student_6.jpg' },
    { name: 'Prof. Sneha Y', email: 'sneha.y@metricsedu.ac.in', teacherId: 'TCH-107', role: 'teacher', institutionType: 'college', department: 'Computer Science & Engineering', profileImage: '/students/student_7.jpg' },
    { name: 'Prof. Roopa U.K', email: 'roopa.uk@metricsedu.ac.in', teacherId: 'TCH-108', role: 'teacher', institutionType: 'college', department: 'Computer Science & Engineering', profileImage: '/students/student_8.jpg' }
  ];

  const collegeTeachers = [];
  for (const t of teachersData) {
    const created = await User.create({ ...t, password: teacherPassword, faceRegistered: true });
    collegeTeachers.push(created);
  }

  // 3. Create Teachers for School
  console.log('👩‍🏫 Creating School Teachers...');
  const schoolTeachersData = [
    { name: 'Mrs. Ananya Sharma', email: 'maths.teacher@metricsedu.ac.in', teacherId: 'TCH-SCH-01', role: 'teacher', institutionType: 'school', standard: '10th Std', department: 'Mathematics' },
    { name: 'Mr. Rajesh Verma', email: 'science.teacher@metricsedu.ac.in', teacherId: 'TCH-SCH-02', role: 'teacher', institutionType: 'school', standard: '10th Std', department: 'Science' },
    { name: 'Ms. Sarah Joseph', email: 'english.teacher@metricsedu.ac.in', teacherId: 'TCH-SCH-03', role: 'teacher', institutionType: 'school', standard: '10th Std', department: 'English' }
  ];

  const schoolTeachers = [];
  for (const st of schoolTeachersData) {
    const created = await User.create({ ...st, password: teacherPassword, faceRegistered: true });
    schoolTeachers.push(created);
  }

  // Map teachers by identifier
  const teacherMap = {
    nandini: collegeTeachers[0],
    pavan: collegeTeachers[1],
    jyoti: collegeTeachers[2],
    quazi: collegeTeachers[3],
    mahalaxmi: collegeTeachers[4],
    pradeep: collegeTeachers[5],
    sneha: collegeTeachers[6],
    roopa: collegeTeachers[7],
    schMaths: schoolTeachers[0],
    schScience: schoolTeachers[1],
    schEnglish: schoolTeachers[2]
  };

  // 4. Create Semester-Wise Courses for College (Sem 3 to Sem 8)
  console.log('📚 Creating Semester-Wise College Courses (2022 Scheme BE CSE)...');
  const collegeCoursesData = [
    // Semester 3
    { code: '22MATCS31', title: 'Mathematics-III for CSE', semester: 3, teacher: teacherMap.pavan._id },
    { code: '22CS32', title: 'Digital Design & Computer Organization', semester: 3, teacher: teacherMap.jyoti._id },
    { code: '22CS33', title: 'Operating Systems', semester: 3, teacher: teacherMap.nandini._id },
    { code: '22CS34', title: 'Data Structures and Applications', semester: 3, teacher: teacherMap.quazi._id },
    { code: '22CSL35', title: 'Data Structures Laboratory', semester: 3, teacher: teacherMap.sneha._id },

    // Semester 4
    { code: '22MATCS41', title: 'Mathematics-IV for CSE', semester: 4, teacher: teacherMap.pavan._id },
    { code: '22CS42', title: 'Design and Analysis of Algorithms', semester: 4, teacher: teacherMap.nandini._id },
    { code: '22CS43', title: 'Database Management Systems', semester: 4, teacher: teacherMap.quazi._id },
    { code: '22CS44', title: 'Computer Organization and Architecture', semester: 4, teacher: teacherMap.jyoti._id },
    { code: '22CSL45', title: 'Database Management Systems Laboratory', semester: 4, teacher: teacherMap.roopa._id },

    // Semester 5 (Active Syllabus Matching Timetable Photo)
    { code: '22CS51', title: 'Software Project Management', semester: 5, teacher: teacherMap.pavan._id },
    { code: '22CS52', title: 'Formal Languages and Automata Theory', semester: 5, teacher: teacherMap.nandini._id },
    { code: '22CS53', title: 'Micro-Controller and Embedded Systems', semester: 5, teacher: teacherMap.jyoti._id },
    { code: '22CS545', title: 'Data Warehousing and Data Mining (PE)', semester: 5, teacher: teacherMap.quazi._id },
    { code: '22AECCS56', title: 'Research Methodology and Intellectual Property Rights', semester: 5, teacher: teacherMap.mahalaxmi._id },
    { code: '22CS55', title: 'Research Based Mini Project', semester: 5, teacher: teacherMap.pradeep._id },
    { code: '22CS58A', title: 'Environmental Studies', semester: 5, teacher: teacherMap.mahalaxmi._id },
    { code: '22CSL59', title: 'Micro-Controller and Embedded Systems Laboratory', semester: 5, teacher: teacherMap.roopa._id },

    // Semester 6
    { code: '22CS61', title: 'Software Engineering & Agile', semester: 6, teacher: teacherMap.pavan._id },
    { code: '22CS62', title: 'Computer Networks', semester: 6, teacher: teacherMap.jyoti._id },
    { code: '22CS635', title: 'Introduction to Salesforce', semester: 6, teacher: teacherMap.nandini._id },
    { code: '22CSL66', title: 'Computer Networks Laboratory', semester: 6, teacher: teacherMap.sneha._id },

    // Semester 7
    { code: '22CS71', title: 'Artificial Intelligence & Deep Learning', semester: 7, teacher: teacherMap.quazi._id },
    { code: '22CS72', title: 'Cloud Computing Architecture', semester: 7, teacher: teacherMap.nandini._id },
    { code: '22CS73', title: 'Big Data Analytics', semester: 7, teacher: teacherMap.pavan._id },

    // Semester 8
    { code: '22CS81', title: 'Major Project Work & Technical Seminar', semester: 8, teacher: teacherMap.nandini._id }
  ];

  const collegeCourses = [];
  for (const c of collegeCoursesData) {
    const created = await Course.create({ ...c, institutionType: 'college', department: 'Computer Science & Engineering' });
    collegeCourses.push(created);
  }

  // 5. Create Standard-Wise Courses for School (1st Std to 10th Std)
  console.log('🏫 Creating Standard-Wise School Courses...');
  const schoolCoursesData = [
    // 10th Std
    { code: 'SCH-MTH-10', title: 'Mathematics (Class 10)', standard: '10th Std', semester: 10, teacher: teacherMap.schMaths._id },
    { code: 'SCH-SCI-10', title: 'General Science (Physics, Chem, Bio)', standard: '10th Std', semester: 10, teacher: teacherMap.schScience._id },
    { code: 'SCH-ENG-10', title: 'English Language & Literature', standard: '10th Std', semester: 10, teacher: teacherMap.schEnglish._id },
    { code: 'SCH-SOC-10', title: 'Social Science (History & Civics)', standard: '10th Std', semester: 10, teacher: teacherMap.schEnglish._id },
    { code: 'SCH-CS-10', title: 'Computer Applications & IT', standard: '10th Std', semester: 10, teacher: teacherMap.schMaths._id },

    // 9th Std
    { code: 'SCH-MTH-9', title: 'Mathematics (Class 9)', standard: '9th Std', semester: 9, teacher: teacherMap.schMaths._id },
    { code: 'SCH-SCI-9', title: 'General Science (Class 9)', standard: '9th Std', semester: 9, teacher: teacherMap.schScience._id },
    { code: 'SCH-ENG-9', title: 'English (Class 9)', standard: '9th Std', semester: 9, teacher: teacherMap.schEnglish._id },

    // 8th Std
    { code: 'SCH-MTH-8', title: 'Mathematics (Class 8)', standard: '8th Std', semester: 8, teacher: teacherMap.schMaths._id },
    { code: 'SCH-SCI-8', title: 'Science (Class 8)', standard: '8th Std', semester: 8, teacher: teacherMap.schScience._id }
  ];

  for (const sc of schoolCoursesData) {
    await Course.create({ ...sc, institutionType: 'school', department: 'Secondary Education' });
  }

  // 6. Create 60 Real Students for College Semester 5 Division C
  console.log('🎓 Creating 60 Students for College Semester 5 Division C...');
  const studentNames = [
    'Aarav Patel', 'Bhavya Sharma', 'Chirag Rao', 'Divya Nair', 'Eshaan Joshi',
    'Fatima Sheikh', 'Gautam Iyer', 'Harini Sundaram', 'Ishaan Verma', 'Jaya Deshmukh',
    'Karthik Gowda', 'Lakshmi Menon', 'Manoj Kumar', 'Neha Reddy', 'Omkar Patil',
    'Pooja Kulkarni', 'Qasim Ali', 'Rohan Gupta', 'Sneha Hegde', 'Tarun Bhat',
    'Uday Kiran', 'Varun Prabhu', 'Wasim Akram', 'Xavier Dsouza', 'Yashaswini M',
    'Zoya Khan', 'Abhishek Shenoy', 'Bindu Madhavi', 'Chetan Katti', 'Deepika Pai',
    'Emran Pasha', 'Falguni Roy', 'Girish Kadam', 'Hemanth Naik', 'Indira K',
    'Jagadish C', 'Kavya S', 'Lalit Modi', 'Manjunath B', 'Naveen Kumar',
    'Pallavi Joshi', 'Raghavendra R', 'Sangeetha M', 'Tanvi Kulkarni', 'Upendra N',
    'Vidya Sagar', 'Vinay Kumar', 'Wahid Khan', 'Yogesh B', 'Zeenat Banu',
    'Aniket Patil', 'Bhoomi S', 'Chandan Gowda', 'Darshan K', 'Ekta Jain',
    'Farhan Siddiqui', 'Gayatri Devi', 'Harshitha R', 'Imran Nazir', 'Jyothika P'
  ];

  const collegeStudents = [];
  const sem5CourseIds = collegeCourses.filter(c => c.semester === 5).map(c => c._id);

  for (let i = 0; i < studentNames.length; i++) {
    const num = i + 1;
    const usn = `1MS22CS${num.toString().padStart(3, '0')}`;
    const name = studentNames[i];
    const email = `${name.toLowerCase().replace(/\s+/g, '.')}.cs22@metricsedu.ac.in`;
    const parentsEmail = `parent.${usn.toLowerCase()}@gmail.com`;
    const avatarIndex = (i % 8) + 1;

    const student = await User.create({
      name,
      email,
      password: studentPassword,
      role: 'student',
      usn,
      institutionType: 'college',
      semester: 5,
      division: 'C',
      section: 'C',
      divisionAllocated: true,
      department: 'Computer Science & Engineering',
      parentsEmail,
      profileImage: `/students/student_${avatarIndex}.jpg`,
      faceRegistered: true,
      lastConfidenceScore: 92 + (i % 7)
    });

    collegeStudents.push(student);
  }

  // Enroll students in Sem 5 courses
  await Course.updateMany(
    { semester: 5 },
    { $set: { enrolledStudents: collegeStudents.map(s => s._id) } }
  );

  // 7. Create 20 School Students (10th Standard)
  console.log('🎒 Creating 20 Students for School 10th Standard...');
  for (let i = 1; i <= 20; i++) {
    const rollNo = `SCH-10-${i.toString().padStart(3, '0')}`;
    await User.create({
      name: `Student ${i} (10th Std)`,
      email: `student.${rollNo.toLowerCase()}@school.metricsedu.ac.in`,
      password: studentPassword,
      role: 'student',
      usn: rollNo,
      institutionType: 'school',
      standard: '10th Std',
      semester: 10,
      division: 'A',
      section: 'A',
      parentsEmail: `parent.sch10.${i}@gmail.com`,
      faceRegistered: true
    });
  }

  // 8. Pre-Populate Division C Semester 5 Official Timetable (AS-11 w.e.f 21/09/2026)
  console.log('🗓️  Pre-populating Official Division-C Timetable (Room AS-11 w.e.f 21/09/2026)...');
  
  // Find course IDs
  const cSPM = collegeCourses.find(c => c.code === '22CS51');
  const cFLAT = collegeCourses.find(c => c.code === '22CS52');
  const cMCES = collegeCourses.find(c => c.code === '22CS53');
  const cPE = collegeCourses.find(c => c.code === '22CS545');
  const cRMIPR = collegeCourses.find(c => c.code === '22AECCS56');
  const cMiniProj = collegeCourses.find(c => c.code === '22CS55');
  const cEVS = collegeCourses.find(c => c.code === '22CS58A');
  const cMCESLab = collegeCourses.find(c => c.code === '22CSL59');

  const divCSlots = [
    // Monday
    { day: 'Monday', timeSlot: '08:30-09:25', course: cRMIPR._id, teacher: teacherMap.mahalaxmi._id, classroom: 'Class Room: AS-11' },
    { day: 'Monday', timeSlot: '09:25-10:20', course: cEVS._id, teacher: teacherMap.mahalaxmi._id, classroom: 'Class Room: AS-11' },
    { day: 'Monday', timeSlot: '10:50-11:45', course: cMCES._id, teacher: teacherMap.jyoti._id, classroom: 'Class Room: AS-11' },
    { day: 'Monday', timeSlot: '11:45-12:40', course: cPE._id, teacher: teacherMap.quazi._id, classroom: 'Class Room: AS-11' },

    // Tuesday
    { day: 'Tuesday', timeSlot: '08:30-09:25', course: cFLAT._id, teacher: teacherMap.nandini._id, classroom: 'Class Room: AS-11' },
    { day: 'Tuesday', timeSlot: '09:25-10:20', course: cSPM._id, teacher: teacherMap.pavan._id, classroom: 'Class Room: AS-11' },
    { day: 'Tuesday', timeSlot: '10:50-11:45', course: cMCES._id, teacher: teacherMap.jyoti._id, classroom: 'Class Room: AS-11' },
    { day: 'Tuesday', timeSlot: '11:45-12:40', course: cPE._id, teacher: teacherMap.quazi._id, classroom: 'Class Room: AS-11' },

    // Wednesday
    { day: 'Wednesday', timeSlot: '08:30-09:25', course: cFLAT._id, teacher: teacherMap.sneha._id, classroom: 'Lab Number-2' },
    { day: 'Wednesday', timeSlot: '09:25-10:20', course: cFLAT._id, teacher: teacherMap.nandini._id, classroom: 'Lab Number-2' },
    { day: 'Wednesday', timeSlot: '10:50-11:45', course: cFLAT._id, teacher: teacherMap.nandini._id, classroom: 'Class Room: AS-11' },
    { day: 'Wednesday', timeSlot: '11:45-12:40', course: cMCES._id, teacher: teacherMap.jyoti._id, classroom: 'Class Room: AS-11' },
    { day: 'Wednesday', timeSlot: '01:30-03:30', course: cPE._id, teacher: teacherMap.quazi._id, classroom: 'Class Room: AS-11' },

    // Thursday
    { day: 'Thursday', timeSlot: '08:30-09:25', course: cMCESLab._id, teacher: teacherMap.roopa._id, classroom: 'Lab Number-6' },
    { day: 'Thursday', timeSlot: '09:25-10:20', course: cMCESLab._id, teacher: teacherMap.jyoti._id, classroom: 'Lab Number-6' },
    { day: 'Thursday', timeSlot: '10:50-11:45', course: cSPM._id, teacher: teacherMap.pavan._id, classroom: 'Class Room: AS-11' },
    { day: 'Thursday', timeSlot: '11:45-12:40', course: cMCES._id, teacher: teacherMap.jyoti._id, classroom: 'Class Room: AS-11' },

    // Friday
    { day: 'Friday', timeSlot: '08:30-09:25', course: cSPM._id, teacher: teacherMap.pavan._id, classroom: 'Class Room: AS-11' },
    { day: 'Friday', timeSlot: '09:25-10:20', course: cEVS._id, teacher: teacherMap.mahalaxmi._id, classroom: 'Class Room: AS-11' },
    { day: 'Friday', timeSlot: '10:50-11:45', course: cRMIPR._id, teacher: teacherMap.mahalaxmi._id, classroom: 'Class Room: AS-11' },
    { day: 'Friday', timeSlot: '11:45-12:40', course: cFLAT._id, teacher: teacherMap.nandini._id, classroom: 'Class Room: AS-11' },

    // Saturday
    { day: 'Saturday', timeSlot: '10:50-11:45', course: cMiniProj._id, teacher: teacherMap.pradeep._id, classroom: 'Class Room: AS-11' },
    { day: 'Saturday', timeSlot: '11:45-12:40', course: cMiniProj._id, teacher: teacherMap.pavan._id, classroom: 'Class Room: AS-11' }
  ];

  for (const s of divCSlots) {
    await Timetable.create({
      ...s,
      division: 'C',
      semester: 5,
      institutionType: 'college',
      classCoordinator: 'Prof. Nandini C.V'
    });
  }

  // 9. Pre-Populate Division A (LH-301) Conflict-Free with breaks between classes
  console.log('🗓️  Pre-populating Division A Timetable (Smart Hall LH-301)...');
  const divASlots = [
    { day: 'Monday', timeSlot: '08:30-09:25', course: cSPM._id, teacher: teacherMap.pavan._id, classroom: 'Smart Lecture Hall LH-301' },
    { day: 'Monday', timeSlot: '09:25-10:20', course: cFLAT._id, teacher: teacherMap.nandini._id, classroom: 'Smart Lecture Hall LH-301' },
    { day: 'Monday', timeSlot: '10:50-11:45', course: cPE._id, teacher: teacherMap.quazi._id, classroom: 'Smart Lecture Hall LH-301' },
    { day: 'Monday', timeSlot: '11:45-12:40', course: cRMIPR._id, teacher: teacherMap.mahalaxmi._id, classroom: 'Smart Lecture Hall LH-301' },

    { day: 'Tuesday', timeSlot: '08:30-09:25', course: cMCES._id, teacher: teacherMap.jyoti._id, classroom: 'Smart Lecture Hall LH-301' },
    { day: 'Tuesday', timeSlot: '09:25-10:20', course: cRMIPR._id, teacher: teacherMap.mahalaxmi._id, classroom: 'Smart Lecture Hall LH-301' },
    { day: 'Tuesday', timeSlot: '10:50-11:45', course: cSPM._id, teacher: teacherMap.pavan._id, classroom: 'Smart Lecture Hall LH-301' },
    { day: 'Tuesday', timeSlot: '11:45-12:40', course: cFLAT._id, teacher: teacherMap.nandini._id, classroom: 'Smart Lecture Hall LH-301' }
  ];

  for (const s of divASlots) {
    await Timetable.create({
      ...s,
      division: 'A',
      semester: 5,
      institutionType: 'college',
      classCoordinator: 'Prof. Pavan K.K'
    });
  }

  console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
  console.log('----------------------------------------------------');
  console.log('Total Users:', await User.countDocuments());
  console.log('Total Courses:', await Course.countDocuments());
  console.log('Total Timetable Slots:', await Timetable.countDocuments());
  console.log('----------------------------------------------------');
  process.exit(0);
}

seedCleanDatabase().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
