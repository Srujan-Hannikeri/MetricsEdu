require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const bcrypt = require('bcryptjs');
const fs = require('fs');
const mongoose = require('mongoose');
const path = require('path');
const User = require('./models/User');
const Course = require('./models/Course');
const Timetable = require('./models/Timetable');
const AttendanceSession = require('./models/AttendanceSession');
const Semester = require('./models/Semester');
const { INSTITUTIONS } = require('./config/institutions');

const DATABASE_NAME = 'metricsedu';
const STUDENTS_PER_COHORT = 200;
const TEACHERS_PER_DEPARTMENT = 30;
const DIVISIONS = ['A', 'B', 'C', 'D'];
const SUBJECTS_BY_TYPE = {
  institute: {
    1: ['Mathematics I', 'Engineering Physics', 'Introduction to Programming', 'Engineering Graphics', 'Basic Electrical Engineering'],
    2: ['Mathematics II', 'Engineering Chemistry', 'Data Structures', 'Engineering Mechanics', 'Communication Skills'],
    default: ['Mathematics', 'Programming Fundamentals', 'Data Structures', 'Digital Systems', 'Laboratory Practice']
  },
  diploma: {
    1: ['Applied Mathematics I', 'Engineering Science', 'Electrical Fundamentals', 'Engineering Drawing', 'Workshop Practice I'],
    2: ['Applied Mathematics II', 'Engineering Chemistry', 'Digital Electronics', 'Programming in C', 'Workshop Practice II'],
    default: ['Applied Mathematics', 'Engineering Science', 'Core Engineering', 'Programming', 'Workshop Practice']
  },
  school: {
    1: ['Kannada', 'English', 'Mathematics', 'Environmental Studies', 'Art and Craft'],
    2: ['Kannada Reading', 'English Reading', 'Mathematics', 'Environmental Science', 'Art and Physical Education'],
    default: ['Kannada', 'English', 'Mathematics', 'Science', 'Social Studies']
  },
  pu_college: {
    Science: {
      1: ['Physics I', 'Chemistry I', 'Mathematics I', 'Biology I', 'English I'],
      2: ['Physics II', 'Chemistry II', 'Mathematics II', 'Biology II', 'English II']
    },
    Arts: {
      1: ['History I', 'Economics I', 'Political Science I', 'Sociology I', 'English I'],
      2: ['History II', 'Economics II', 'Political Science II', 'Sociology II', 'English II']
    },
    Commerce: {
      1: ['Accountancy I', 'Business Studies I', 'Economics I', 'Statistics I', 'English I'],
      2: ['Accountancy II', 'Business Studies II', 'Economics II', 'Statistics II', 'English II']
    }
  }
};
const SUBJECTS_PER_COHORT = 5;
const CLASS_TIMES = [
  ['08:30 AM - 09:25 AM', 510, 565],
  ['09:25 AM - 10:20 AM', 565, 620],
  ['10:50 AM - 11:45 AM', 650, 705],
  ['11:45 AM - 12:40 PM', 705, 760]
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const STUDENT_IMAGES = Array.from({ length: 8 }, (_, index) =>
  `/uploads/students/student_${index + 1}.jpg`
);
const CLASSROOM_IMAGES = [
  '/uploads/classroom/classroom_60_divA.jpg',
  '/uploads/classroom/classroom_60_divB.jpg'
];

const ADMIN_DEFINITIONS = {
  institute: {
    name: 'Institute Admin',
    email: 'admin@metricsedu.ac.in',
    adminId: 'ADM-INST-001',
    department: 'Administration'
  },
  school: {
    name: 'School Principal',
    email: 'schooladmin@metricsedu.ac.in',
    adminId: 'ADM-SCH-001',
    department: 'Administration'
  },
  pu_college: {
    name: 'PU College Admin',
    email: 'puadmin@metricsedu.ac.in',
    adminId: 'ADM-PUC-001',
    department: 'Administration'
  },
  diploma: {
    name: 'Diploma Admin',
    email: 'diplomaadmin@metricsedu.ac.in',
    adminId: 'ADM-DIP-001',
    department: 'Administration'
  }
};

function assertSafeTarget(uri) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset a database while NODE_ENV=production.');
  }
  if (!uri) throw new Error('MONGO_URI is not configured.');

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('MONGO_URI is not a valid MongoDB URL.');
  }

  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (parsed.protocol !== 'mongodb:' || !localHosts.has(parsed.hostname.toLowerCase()) ||
      databaseName !== DATABASE_NAME) {
    throw new Error(`Refusing reset: only loopback MongoDB database "${DATABASE_NAME}" is allowed.`);
  }
}

function assertSafeRemoteSeedTarget(uri) {
  if (process.env.VERCEL) {
    throw new Error('Run the remote seed command from your local computer, not a Vercel Function.');
  }
  if (!uri) throw new Error('Set MONGO_URI to the hosted MongoDB connection string.');

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('MONGO_URI could not be parsed. Copy the Atlas driver URI and URL-encode any special characters in the username or password (for example, @ as %40).');
  }

  const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) ||
      localHosts.has(parsed.hostname.toLowerCase()) ||
      databaseName !== DATABASE_NAME) {
    throw new Error(`Refusing remote seed: use a hosted MongoDB URI that explicitly targets "${DATABASE_NAME}".`);
  }
}

function makeCohorts() {
  const cohorts = [];
  for (const branch of INSTITUTIONS.institute.branches) {
    for (const semester of INSTITUTIONS.institute.semesters) {
      cohorts.push({ institutionType: 'institute', branch, semester });
    }
  }
  for (const branch of INSTITUTIONS.diploma.branches) {
    for (const semester of INSTITUTIONS.diploma.semesters) {
      cohorts.push({ institutionType: 'diploma', branch, semester });
    }
  }
  for (const standard of INSTITUTIONS.school.standards) {
    cohorts.push({ institutionType: 'school', standard });
  }
  for (const pucYear of INSTITUTIONS.pu_college.pucYears) {
    for (const pucDept of INSTITUTIONS.pu_college.pucDepts) {
      cohorts.push({ institutionType: 'pu_college', pucYear, pucDept });
    }
  }
  return cohorts;
}

function branchCode(branch, institutionType) {
  const codes = institutionType === 'institute'
    ? ['CS', 'AIML', 'DS', 'IS', 'EC', 'EE', 'ME', 'CV', 'CH', 'BT']
    : ['DCS', 'DIS', 'DEC', 'DEE', 'DME', 'DCV'];
  const branches = INSTITUTIONS[institutionType].branches;
  return codes[branches.indexOf(branch)];
}

function cohortKey(cohort) {
  if (cohort.institutionType === 'school') return `school-${cohort.standard}`;
  if (cohort.institutionType === 'pu_college') {
    return `puc-${cohort.pucYear}-${cohort.pucDept}`;
  }
  return `${cohort.institutionType}-${cohort.branch}-${cohort.semester}`;
}

function cohortFields(cohort) {
  if (cohort.institutionType === 'school') {
    return { standard: cohort.standard, semester: Number(cohort.standard.match(/^\d+/)[0]) };
  }
  if (cohort.institutionType === 'pu_college') {
    return {
      pucYear: cohort.pucYear,
      pucDept: cohort.pucDept,
      semester: cohort.pucYear === '2nd PUC' ? 2 : 1
    };
  }
  return { branch: cohort.branch, department: cohort.branch, semester: cohort.semester };
}

function makeAdminDocs(passwordHash) {
  return Object.entries(ADMIN_DEFINITIONS).map(([institutionType, definition]) => ({
    _id: new mongoose.Types.ObjectId(),
    ...definition,
    email: definition.email.toLowerCase(),
    password: passwordHash,
    role: 'admin',
    institutionType,
    branch: '',
    standard: '',
    pucYear: '',
    pucDept: '',
    isActive: true,
    createdAt: new Date()
  }));
}

function makeTeachers(passwordHash, institutionType, cohort, createdByAdmin) {
  const typeCode = institutionType === 'institute' ? 'INST'
    : institutionType === 'pu_college' ? 'PUC'
      : institutionType.toUpperCase();
  const department = institutionType === 'school' ? '' :
    institutionType === 'pu_college' ? cohort.pucDept : cohort.branch;
  const code = institutionType === 'school' ? 'SCH'
    : institutionType === 'pu_college' ? cohort.pucDept.slice(0, 3).toUpperCase()
      : branchCode(cohort.branch, institutionType);
  const firstNames = ['Asha', 'Bharath', 'Charan', 'Deepa', 'Esha', 'Farhan', 'Girish', 'Hema', 'Ishaan', 'Jyoti'];
  const lastNames = ['Sharma', 'Rao', 'Patel', 'Nair', 'Kumar', 'Shetty', 'Hegde', 'Joshi', 'Iyer', 'Menon'];

  return Array.from({ length: TEACHERS_PER_DEPARTMENT }, (_, index) => {
    const serial = String(index + 1).padStart(2, '0');
    let teacherId = `TCH-${typeCode}-${code}-${serial}`;
    if (institutionType === 'institute' && code === 'CS' && index === 0) teacherId = 'TCH-101';
    if (institutionType === 'school') teacherId = `TCH-SCH-${serial}`;
    if (institutionType === 'pu_college') teacherId = `TCH-PUC-${code}-${serial}`;

    return {
      _id: new mongoose.Types.ObjectId(),
      name: `${['Prof.', 'Dr.', 'Ms.'][index % 3]} ${firstNames[index % firstNames.length]} ${lastNames[Math.floor(index / 3) % lastNames.length]}`,
      email: `teacher-${typeCode.toLowerCase()}-${code.toLowerCase()}-${serial}@metricsedu.local`,
      password: passwordHash,
      role: 'teacher',
      teacherId,
      institutionType,
      createdByAdmin,
      department,
      branch: institutionType === 'institute' || institutionType === 'diploma' ? cohort.branch : '',
      standard: '',
      pucYear: '',
      pucDept: institutionType === 'pu_college' ? cohort.pucDept : '',
      profileImage: STUDENT_IMAGES[index % STUDENT_IMAGES.length],
      isActive: true,
      createdAt: new Date()
    };
  });
}

function makeStudentUsn(cohort, serial, code) {
  const paddedSerial = String(serial).padStart(3, '0');
  if (cohort.institutionType === 'institute') {
    if (code === 'CS' && cohort.semester === 5 && serial === 1) return '1MS22CS001';
    return `1MS26${code}${cohort.semester}${paddedSerial}`;
  }
  if (cohort.institutionType === 'diploma') {
    if (code === 'DCS' && cohort.semester === 1 && serial === 1) return 'DIP-DCS-001';
    return `DIP-${code}-${cohort.semester}-${paddedSerial}`;
  }
  if (cohort.institutionType === 'school') {
    const standardNumber = Number(cohort.standard.match(/^\d+/)[0]);
    if (standardNumber === 10 && serial === 1) return 'SCH-10-001';
    return `SCH-${standardNumber}-${paddedSerial}`;
  }

  const yearIndex = cohort.pucYear === '2nd PUC' ? 2 : 1;
  const deptCode = cohort.pucDept === 'Science' ? 'S'
    : cohort.pucDept === 'Arts' ? 'A' : 'C';
  if (yearIndex === 1 && cohort.pucDept === 'Science' && serial === 1) return 'PUC-1PUC-S-001';
  return `PUC-${yearIndex}-${deptCode}-${paddedSerial}`;
}

function makeStudentName(index) {
  const first = ['Aarav', 'Aditi', 'Ananya', 'Arjun', 'Diya', 'Ishaan', 'Kavya', 'Meera', 'Rohan', 'Saanvi'];
  const last = ['Patel', 'Sharma', 'Rao', 'Nair', 'Kumar', 'Shetty', 'Hegde', 'Joshi', 'Iyer', 'Menon'];
  return `${first[index % first.length]} ${last[Math.floor(index / first.length) % last.length]}`;
}

function makeSubjects(cohort) {
  const semester = cohortFields(cohort).semester;
  if (cohort.institutionType === 'pu_college') {
    return SUBJECTS_BY_TYPE.pu_college[cohort.pucDept][semester];
  }
  const subjects = SUBJECTS_BY_TYPE[cohort.institutionType];
  return subjects[semester] || subjects.default;
}

function timeToMinutes(value) {
  const [time, meridiem] = value.trim().split(/\s+/);
  let [hours, minutes] = time.split(':').map(Number);
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function makeDataset(passwordHashes) {
  const cohortSpecs = makeCohorts();
  const adminDocs = makeAdminDocs(passwordHashes.admin);
  const adminsByType = Object.fromEntries(adminDocs.map(admin => [admin.institutionType, admin]));
  const teacherDocs = [];
  const teacherPools = new Map();

  for (const type of ['institute', 'diploma', 'school', 'pu_college']) {
    const representatives = type === 'institute' ? INSTITUTIONS.institute.branches
      : type === 'diploma' ? INSTITUTIONS.diploma.branches
        : type === 'school' ? ['']
          : INSTITUTIONS.pu_college.pucDepts;
    for (const department of representatives) {
      const sampleCohort = type === 'institute' || type === 'diploma'
        ? { institutionType: type, branch: department }
        : type === 'pu_college'
          ? { institutionType: type, pucDept: department }
          : { institutionType: type };
      const teachers = makeTeachers(passwordHashes.teacher, type, sampleCohort, adminsByType[type]._id);
      teacherDocs.push(...teachers);
      teacherPools.set(`${type}:${department}`, teachers);
    }
  }

  const students = [];
  const courses = [];
  const timetables = [];
  const semesters = [];
  const attendanceSessions = [];
  const year = new Date().getFullYear();
  const cohortStudents = new Map();

  for (let cohortIndex = 0; cohortIndex < cohortSpecs.length; cohortIndex++) {
    const cohort = cohortSpecs[cohortIndex];
    const key = cohortKey(cohort);
    const fields = cohortFields(cohort);
    const type = cohort.institutionType;
    const code = type === 'institute' || type === 'diploma'
      ? branchCode(cohort.branch, type)
      : type === 'school' ? 'SCH'
        : cohort.pucDept.slice(0, 3).toUpperCase();
    const teacherPoolKey = type === 'institute' || type === 'diploma'
      ? `${type}:${cohort.branch}`
      : type === 'school' ? 'school:'
        : `pu_college:${cohort.pucDept}`;
    const teachers = teacherPools.get(teacherPoolKey);
    const studentsByDivision = Object.fromEntries(DIVISIONS.map(division => [division, []]));

    for (let index = 0; index < STUDENTS_PER_COHORT; index++) {
      const division = DIVISIONS[Math.floor(index / (STUDENTS_PER_COHORT / DIVISIONS.length))];
      const usn = makeStudentUsn(cohort, index + 1, code);
      const student = {
        _id: new mongoose.Types.ObjectId(),
        name: makeStudentName(index + cohortIndex * STUDENTS_PER_COHORT),
        usn,
        email: `${usn.toLowerCase()}@metricsedu.local`,
        password: passwordHashes.student,
        role: 'student',
        institutionType: type,
        createdByAdmin: adminsByType[type]._id,
        department: type === 'school' ? '' : type === 'pu_college' ? cohort.pucDept : cohort.branch,
        branch: type === 'institute' || type === 'diploma' ? cohort.branch : '',
        semester: fields.semester,
        semesterHours: 60,
        standard: cohort.standard || '',
        pucYear: cohort.pucYear || '',
        pucDept: cohort.pucDept || '',
        division,
        section: division,
        divisionAllocated: true,
        profileImage: STUDENT_IMAGES[index % STUDENT_IMAGES.length],
        faceRegistered: false,
        faceDescriptor: [],
        lastConfidenceScore: 0,
        photoUpdateRequired: false,
        isActive: true,
        createdAt: new Date()
      };
      students.push(student);
      studentsByDivision[division].push(student);
    }
    cohortStudents.set(key, studentsByDivision);

    const semesterDoc = {
      _id: new mongoose.Types.ObjectId(),
      institutionType: type,
      adminId: adminsByType[type]._id,
      branch: cohort.branch || '',
      semesterNumber: type === 'institute' || type === 'diploma' ? cohort.semester : fields.semester,
      standard: cohort.standard || '',
      pucYear: cohort.pucYear || '',
      pucDept: cohort.pucDept || '',
      startDate: new Date(year, 0, 1),
      endDate: new Date(year, 11, 31, 23, 59, 59),
      academicYear: `${year}-${String(year + 1).slice(-2)}`,
      isActive: true,
      isLocked: false,
      subjects: [],
      createdAt: new Date()
    };
    semesters.push(semesterDoc);

    const subjects = makeSubjects(cohort);
    const coursesByDivision = Object.fromEntries(DIVISIONS.map(division => [division, []]));
    for (let subjectIndex = 0; subjectIndex < subjects.length; subjectIndex++) {
      const subjectCode = `${code}${fields.semester}${String(subjectIndex + 1).padStart(2, '0')}`;
      for (let divisionIndex = 0; divisionIndex < DIVISIONS.length; divisionIndex++) {
        const division = DIVISIONS[divisionIndex];
        const teacher = teachers[(cohortIndex + subjectIndex + divisionIndex) % teachers.length];
        const course = {
          _id: new mongoose.Types.ObjectId(),
          code: subjectCode,
          title: subjects[subjectIndex],
          department: type === 'school' ? '' : type === 'pu_college' ? cohort.pucDept : cohort.branch,
          branch: type === 'institute' || type === 'diploma' ? cohort.branch : '',
          semester: fields.semester,
          institutionType: type,
          standard: cohort.standard || '',
          pucYear: cohort.pucYear || '',
          pucDept: cohort.pucDept || '',
          section: division,
          semesterRef: semesterDoc._id,
          createdByAdmin: adminsByType[type]._id,
          teacher: teacher._id,
          enrolledStudents: studentsByDivision[division].map(student => student._id),
          totalClassesHeld: 0,
          createdAt: new Date()
        };
        courses.push(course);
        semesterDoc.subjects.push({
          code: subjectCode,
          title: course.title,
          semesterHours: 60,
          weeklyHours: 4,
          division,
          teacher: teacher._id
        });
        coursesByDivision[division].push({ course, teacher, subjectIndex, divisionIndex, subjectCode });
        const [timeSlot, startMinutes, endMinutes] = CLASS_TIMES[divisionIndex];
        timetables.push({
          _id: new mongoose.Types.ObjectId(),
          day: DAYS[subjectIndex],
          timeSlot,
          startMinutes,
          endMinutes,
          course: course._id,
          teacher: teacher._id,
          division,
          classroom: `${code}-${fields.semester}-${division}`,
          semester: fields.semester,
          branch: type === 'institute' || type === 'diploma' ? cohort.branch : '',
          institutionType: type,
          standard: cohort.standard || '',
          pucYear: cohort.pucYear || '',
          pucDept: cohort.pucDept || '',
          department: course.department,
          semesterRef: semesterDoc._id,
          isLocked: false,
          createdAt: new Date()
        });
      }
    }

    for (let divisionIndex = 0; divisionIndex < DIVISIONS.length; divisionIndex++) {
      const division = DIVISIONS[divisionIndex];
      const demoCourse = coursesByDivision[division][0];
      const records = studentsByDivision[division].map((student, studentIndex) => {
        const present = studentIndex % 5 !== 0;
        return {
          student: student._id,
          usn: student.usn,
          name: student.name,
          status: present ? 'Present' : 'Absent',
          confidence: present ? 96 : 0,
          detectedBox: { x: 0, y: 0, width: 0, height: 0 },
          isManuallyOverridden: false
        };
      });
      attendanceSessions.push({
        _id: new mongoose.Types.ObjectId(),
        course: demoCourse.course._id,
        teacher: demoCourse.teacher._id,
        institutionType: type,
        division,
        classroom: `${code}-${fields.semester}-${division}`,
        sessionDate: new Date(Date.now() - (cohortIndex % 14) * 86400000),
        classPhoto: CLASSROOM_IMAGES[divisionIndex % CLASSROOM_IMAGES.length],
        teacherPhoto: demoCourse.teacher.profileImage,
        teacherAttendanceStatus: 'Present',
        timeSlot: CLASS_TIMES[divisionIndex][0],
        detectedFacesCount: 40,
        matchedStudentsCount: 40,
        records,
        totalEnrolled: records.length,
        totalPresent: 40,
        totalAbsent: 10,
        attendancePercentage: 80,
        status: 'Finalized',
        notes: 'Demo seed data; replace with verified attendance records.',
        createdAt: new Date()
      });
    }
  }

  return {
    admins: adminDocs,
    teachers: teacherDocs,
    students,
    courses,
    timetables,
    semesters,
    attendanceSessions,
    cohortSpecs
  };
}

function validateDataset(dataset) {
  const expectedStudentCount = dataset.cohortSpecs.length * STUDENTS_PER_COHORT;
  const expectedCourseCount = dataset.cohortSpecs.length * SUBJECTS_PER_COHORT * DIVISIONS.length;
  const expectedTimetableCount = dataset.cohortSpecs.length * SUBJECTS_PER_COHORT * DIVISIONS.length;
  if (dataset.students.length !== expectedStudentCount ||
      dataset.teachers.length !== 600 ||
      dataset.admins.length !== 4 ||
      dataset.courses.length !== expectedCourseCount ||
      dataset.timetables.length !== expectedTimetableCount ||
      dataset.semesters.length !== dataset.cohortSpecs.length ||
      dataset.attendanceSessions.length !== dataset.cohortSpecs.length * DIVISIONS.length) {
    throw new Error('Generated data did not match the requested dataset sizes.');
  }

  const users = [...dataset.admins, ...dataset.teachers, ...dataset.students];
  const adminsByType = new Map(dataset.admins.map(admin => [admin.institutionType, admin._id.toString()]));
  for (const field of ['email', 'adminId', 'teacherId', 'usn']) {
    const values = users.map(user => user[field]).filter(Boolean);
    if (new Set(values).size !== values.length) {
      throw new Error(`Generated user ${field} values are not unique.`);
    }
  }
  for (const user of [...dataset.teachers, ...dataset.students]) {
    if (user.createdByAdmin?.toString() !== adminsByType.get(user.institutionType)) {
      throw new Error(`Generated ${user.role} is not assigned to its institution admin.`);
    }
  }

  const teacherGroups = new Map();
  for (const teacher of dataset.teachers) {
    const departmentKey = teacher.institutionType === 'school'
      ? 'school'
      : teacher.institutionType === 'pu_college'
        ? `pu_college:${teacher.pucDept}`
        : `${teacher.institutionType}:${teacher.branch}`;
    teacherGroups.set(departmentKey, (teacherGroups.get(departmentKey) || 0) + 1);
  }
  for (const count of teacherGroups.values()) {
    if (count !== TEACHERS_PER_DEPARTMENT) {
      throw new Error(`Expected ${TEACHERS_PER_DEPARTMENT} teachers per department, found ${count}.`);
    }
  }

  for (const cohort of dataset.cohortSpecs) {
    const semester = cohortFields(cohort).semester;
    if (semester !== 1 && semester !== 2) continue;

    const cohortCourses = dataset.courses.filter(course =>
      course.institutionType === cohort.institutionType &&
      course.semester === semester &&
      (cohort.branch ? course.branch === cohort.branch : true) &&
      (cohort.standard ? course.standard === cohort.standard : true) &&
      (cohort.pucYear ? course.pucYear === cohort.pucYear : true) &&
      (cohort.pucDept ? course.pucDept === cohort.pucDept : true)
    );
    const subjectTitles = [...new Set(cohortCourses.map(course => course.title))].sort();
    const subjectCodes = [...new Set(cohortCourses.map(course => course.code))];
    if (cohortCourses.length !== SUBJECTS_PER_COHORT * DIVISIONS.length ||
        cohortCourses.some(course => /(?:^|\s)-?\s*Section\s+[A-F]$/i.test(course.title) ||
          /[A-F]$/i.test(course.code) || !DIVISIONS.includes(course.section)) ||
        subjectTitles.length !== SUBJECTS_PER_COHORT || subjectCodes.length !== SUBJECTS_PER_COHORT ||
        subjectCodes.some(code => DIVISIONS.some(division =>
          cohortCourses.filter(course => course.code === code && course.section === division).length !== 1
        ))) {
      throw new Error(`Expected each common subject and course code to have one course per division for ${cohortKey(cohort)}.`);
    }

    const nextTermCohort = dataset.cohortSpecs.find(candidate =>
      candidate.institutionType === cohort.institutionType &&
      cohortFields(candidate).semester === (semester === 1 ? 2 : 1) &&
      ((cohort.institutionType === 'institute' || cohort.institutionType === 'diploma') &&
        candidate.branch === cohort.branch ||
       cohort.institutionType === 'school' &&
        candidate.standard === (semester === 1 ? '2nd Std' : '1st Std') ||
       cohort.institutionType === 'pu_college' &&
        candidate.pucYear === (semester === 1 ? '2nd PUC' : '1st PUC') &&
        candidate.pucDept === cohort.pucDept)
    );
    if (nextTermCohort && makeSubjects(cohort).join('|') === makeSubjects(nextTermCohort).join('|')) {
      throw new Error(`Semester 1 and semester 2 subjects must differ for ${cohortKey(cohort)}.`);
    }
  }

  const imagePaths = [...STUDENT_IMAGES, ...CLASSROOM_IMAGES].map(image =>
    path.join(__dirname, 'uploads', image.replace(/^\/uploads\//, '').replace(/\//g, path.sep))
  );
  const missingImages = imagePaths.filter(imagePath => !fs.existsSync(imagePath));
  if (missingImages.length) {
    throw new Error(`Required local seed images are missing: ${missingImages.join(', ')}`);
  }
}

async function insertInBatches(Model, documents, batchSize = 1000) {
  for (let offset = 0; offset < documents.length; offset += batchSize) {
    await Model.insertMany(documents.slice(offset, offset + batchSize), { ordered: true });
  }
}

async function deleteSeedDocuments(Model, documents, batchSize = 1000) {
  for (let offset = 0; offset < documents.length; offset += batchSize) {
    const ids = documents.slice(offset, offset + batchSize).map(document => document._id);
    await Model.deleteMany({ _id: { $in: ids } });
  }
}

async function verifyDataset(dataset) {
  const expectedStudentCount = dataset.cohortSpecs.length * STUDENTS_PER_COHORT;
  const [userCount, courseCount, timetableCount, semesterCount, sessionCount, studentsWithImages] = await Promise.all([
    User.countDocuments({}),
    Course.countDocuments({}),
    Timetable.countDocuments({}),
    Semester.countDocuments({}),
    AttendanceSession.countDocuments({}),
    User.countDocuments({ role: 'student', profileImage: { $ne: '' } })
  ]);
  if (userCount !== dataset.admins.length + dataset.teachers.length + expectedStudentCount ||
      courseCount !== dataset.courses.length ||
      timetableCount !== dataset.timetables.length ||
      semesterCount !== dataset.semesters.length ||
      sessionCount !== dataset.attendanceSessions.length ||
      studentsWithImages !== expectedStudentCount) {
    throw new Error('Post-seed counts did not match the expected dataset.');
  }

  for (const cohort of dataset.cohortSpecs) {
    const filter = { role: 'student', institutionType: cohort.institutionType };
    if (cohort.branch) filter.branch = cohort.branch;
    if (cohort.semester) filter.semester = cohort.semester;
    if (cohort.standard) filter.standard = cohort.standard;
    if (cohort.pucYear) filter.pucYear = cohort.pucYear;
    if (cohort.pucDept) filter.pucDept = cohort.pucDept;
    const count = await User.countDocuments(filter);
    if (count !== STUDENTS_PER_COHORT) {
      throw new Error(`Expected ${STUDENTS_PER_COHORT} students for ${cohortKey(cohort)}, found ${count}.`);
    }
  }

  return { userCount, courseCount, timetableCount, semesterCount, sessionCount };
}

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/metricsedu';
  const remoteSeed = process.argv.includes('--confirm-seed-remote');
  if (remoteSeed) {
    assertSafeRemoteSeedTarget(process.env.MONGO_URI);
  } else {
    assertSafeTarget(uri);
  }

  if (process.argv.includes('--dry-run')) {
    const passwordHashes = {
      admin: await bcrypt.hash('adminpassword123', 10),
      teacher: await bcrypt.hash('teacherpassword123', 10),
      student: await bcrypt.hash('studentpassword123', 10)
    };
    const dataset = makeDataset(passwordHashes);
    validateDataset(dataset);
    console.log(remoteSeed
      ? `Target: hosted MongoDB database "${DATABASE_NAME}" (no connection made)`
      : `Target: loopback MongoDB database "${DATABASE_NAME}"`);
    console.log(`Students: ${dataset.students.length}`);
    console.log(`Teachers: ${dataset.teachers.length}`);
    console.log(`Semester courses: ${dataset.courses.length}`);
    console.log(`Timetable slots: ${dataset.timetables.length}`);
    console.log(`Semester configs: ${dataset.semesters.length}`);
    console.log(`Attendance sessions: ${dataset.attendanceSessions.length}`);
    console.log(`Admins: ${dataset.admins.length}`);
    console.log('No database changes made (dry run).');
    return;
  }

  if (process.argv.includes('--confirm-reset') && remoteSeed) {
    throw new Error('Choose either --confirm-reset or --confirm-seed-remote, not both.');
  }

  if (remoteSeed) {
    const passwordHashes = {
      admin: await bcrypt.hash('adminpassword123', 10),
      teacher: await bcrypt.hash('teacherpassword123', 10),
      student: await bcrypt.hash('studentpassword123', 10)
    };
    const dataset = makeDataset(passwordHashes);
    validateDataset(dataset);

    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
    if (mongoose.connection.name !== DATABASE_NAME ||
        localHosts.has(mongoose.connection.host.toLowerCase())) {
      throw new Error('Connected database did not pass the hosted metricsedu safety check.');
    }

    const db = mongoose.connection.db;
    const collectionNames = (await db.listCollections({}, { nameOnly: true }).toArray())
      .map(collection => collection.name)
      .filter(name => !name.startsWith('system.'));
    for (const collectionName of collectionNames) {
      const count = await db.collection(collectionName).countDocuments({});
      if (count > 0) {
        throw new Error(`Refusing to seed a non-empty database: collection "${collectionName}" contains ${count} documents. Use a new empty metricsedu database.`);
      }
    }

    let counts;
    try {
      await Promise.all([
        User.init(), Course.init(), Timetable.init(), AttendanceSession.init(), Semester.init()
      ]);
      await insertInBatches(User, [...dataset.admins, ...dataset.teachers, ...dataset.students]);
      await insertInBatches(Semester, dataset.semesters);
      await insertInBatches(Course, dataset.courses);
      await insertInBatches(Timetable, dataset.timetables);
      await insertInBatches(AttendanceSession, dataset.attendanceSessions);
      counts = await verifyDataset(dataset);
    } catch (error) {
      try {
        await Promise.all([
          deleteSeedDocuments(User, [...dataset.admins, ...dataset.teachers, ...dataset.students]),
          deleteSeedDocuments(Semester, dataset.semesters),
          deleteSeedDocuments(Course, dataset.courses),
          deleteSeedDocuments(Timetable, dataset.timetables),
          deleteSeedDocuments(AttendanceSession, dataset.attendanceSessions)
        ]);
      } catch (cleanupError) {
        throw new Error(`Remote seed failed (${error.message}) and cleanup also failed (${cleanupError.message}). Inspect the target database before retrying.`);
      }
      throw new Error(`Remote seed failed; inserted demo documents were rolled back. ${error.message}`);
    }

    console.log('Hosted MetricsEdu demo dataset seeded successfully.');
    console.log(JSON.stringify({
      database: DATABASE_NAME,
      counts,
      studentsPerCohort: STUDENTS_PER_COHORT,
      teachersPerDepartment: TEACHERS_PER_DEPARTMENT,
      admins: dataset.admins.map(({ adminId, email, institutionType }) => ({ adminId, email, institutionType })),
      demoPasswords: {
        admin: 'adminpassword123',
        teacher: 'teacherpassword123',
        student: 'studentpassword123'
      },
      warning: 'Change all demo passwords after the first login. Seeded image paths refer to local demo assets.'
    }, null, 2));
    return;
  }

  if (!process.argv.includes('--confirm-reset')) {
    throw new Error('Pass --confirm-reset to reset the local metricsedu database, or --confirm-seed-remote to seed an empty hosted metricsedu database.');
  }

  const passwordHashes = {
    admin: await bcrypt.hash('adminpassword123', 10),
    teacher: await bcrypt.hash('teacherpassword123', 10),
    student: await bcrypt.hash('studentpassword123', 10)
  };
  const dataset = makeDataset(passwordHashes);
  validateDataset(dataset);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  if (mongoose.connection.name !== DATABASE_NAME ||
      !new Set(['127.0.0.1', 'localhost', '::1']).has(mongoose.connection.host.toLowerCase())) {
    throw new Error('Connected database did not pass the local reset safety check.');
  }

  const db = mongoose.connection.db;
  const collectionNames = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map(collection => collection.name);
  const appCollections = new Set([
    'users', 'courses', 'timetables', 'attendancesessions', 'semesters',
    'academicevents', 'learningposts'
  ]);
  const unexpectedCollections = collectionNames.filter(name =>
    !appCollections.has(name) && !name.startsWith('system.')
  );
  if (unexpectedCollections.length) {
    throw new Error(`Unexpected collections found; refusing reset: ${unexpectedCollections.join(', ')}`);
  }

  for (const collectionName of appCollections) {
    if (collectionNames.includes(collectionName)) {
      await db.dropCollection(collectionName);
    }
  }
  await Promise.all([
    User.init(), Course.init(), Timetable.init(), AttendanceSession.init(), Semester.init()
  ]);

  await insertInBatches(User, [...dataset.admins, ...dataset.teachers, ...dataset.students]);
  await insertInBatches(Semester, dataset.semesters);
  await insertInBatches(Course, dataset.courses);
  await insertInBatches(Timetable, dataset.timetables);
  await insertInBatches(AttendanceSession, dataset.attendanceSessions);

  const counts = await verifyDataset(dataset);
  console.log('Local MetricsEdu dataset reset and seeded successfully.');
  console.log(JSON.stringify({
    database: DATABASE_NAME,
    counts,
    studentsPerCohort: STUDENTS_PER_COHORT,
    teachersPerDepartment: TEACHERS_PER_DEPARTMENT,
    admins: dataset.admins.map(({ adminId, email, institutionType }) => ({ adminId, email, institutionType })),
    demoPasswords: {
      admin: 'adminpassword123',
      teacher: 'teacherpassword123',
      student: 'studentpassword123'
    }
  }, null, 2));
}

main()
  .catch(error => {
    console.error(`Seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
