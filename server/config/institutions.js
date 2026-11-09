const INSTITUTIONS = {
  institute: {
    label: 'Engineering Institute',
    branches: [
      'Computer Science & Engineering',
      'Computer Science & Engineering (AI & ML)',
      'Computer Science & Engineering (Data Science)',
      'Information Science & Engineering',
      'Electronics & Communication Engineering',
      'Electrical & Electronics Engineering',
      'Mechanical Engineering',
      'Civil Engineering',
      'Chemical Engineering',
      'Biotechnology'
    ],
    semesters: [1, 2, 3, 4, 5, 6, 7, 8]
  },
  diploma: {
    label: 'Diploma (Polytechnic)',
    branches: [
      'Computer Science & Engineering',
      'Information Science & Engineering',
      'Electronics & Communication Engineering',
      'Electrical & Electronics Engineering',
      'Mechanical Engineering',
      'Civil Engineering'
    ],
    semesters: [1, 2, 3, 4, 5, 6]
  },
  school: {
    label: 'School (1st–10th Std)',
    standards: [
      '1st Std', '2nd Std', '3rd Std', '4th Std', '5th Std',
      '6th Std', '7th Std', '8th Std', '9th Std', '10th Std'
    ]
  },
  pu_college: {
    label: 'PU College (1st & 2nd PUC)',
    pucYears: ['1st PUC', '2nd PUC'],
    pucDepts: ['Science', 'Arts', 'Commerce']
  }
};

function normalizeInstitutionType(institutionType) {
  return institutionType === 'college' ? 'institute' : institutionType;
}

function getInstitutionTypeFilter(institutionType) {
  return normalizeInstitutionType(institutionType) === 'institute'
    ? { $in: ['institute', 'college'] }
    : normalizeInstitutionType(institutionType);
}

function isSameInstitution(left, right) {
  return normalizeInstitutionType(left?.institutionType) === normalizeInstitutionType(right?.institutionType);
}

function getTenantAdminId(user) {
  return user?.role === 'admin' ? user.createdByAdmin || user._id : user?.createdByAdmin || null;
}

function getStudentCohortFilter(student) {
  const filter = {
    institutionType: getInstitutionTypeFilter(student.institutionType)
  };

  if (student.institutionType === 'school') {
    filter.standard = student.standard;
  } else if (student.institutionType === 'pu_college') {
    filter.pucYear = student.pucYear;
    filter.pucDept = student.pucDept;
  } else {
    filter.branch = student.branch || student.department;
    filter.semester = student.semester;
  }

  return filter;
}

module.exports = {
  INSTITUTIONS,
  normalizeInstitutionType,
  getInstitutionTypeFilter,
  isSameInstitution,
  getTenantAdminId,
  getStudentCohortFilter
};
