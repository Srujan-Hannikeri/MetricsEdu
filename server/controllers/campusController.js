const AcademicEvent = require('../models/AcademicEvent');
const LearningPost = require('../models/LearningPost');
const Course = require('../models/Course');
const User = require('../models/User');
const { saveUploadedFile } = require('../services/uploadService');
const {
  INSTITUTIONS,
  getInstitutionTypeFilter,
  getStudentCohortFilter,
  getTenantAdminId,
  normalizeInstitutionType
} = require('../config/institutions');

function cohortEventFilter(user) {
  const filter = {};
  const addCohort = (key, value) => {
    filter[key] = value ? { $in: ['', value] } : '';
  };
  if (user.role === 'student') {
    if (user.institutionType === 'school') {
      addCohort('standard', user.standard);
    } else if (user.institutionType === 'pu_college') {
      addCohort('pucYear', user.pucYear);
      addCohort('pucDept', user.pucDept);
    } else {
      addCohort('branch', user.branch || user.department);
      filter.semester = { $in: [null, user.semester] };
      addCohort('division', user.division || user.section);
    }
  } else if (user.role === 'teacher') {
    if (user.institutionType === 'pu_college') {
      addCohort('pucDept', user.pucDept || user.department);
    } else if (user.institutionType === 'institute' || user.institutionType === 'diploma' || user.institutionType === 'college') {
      addCohort('branch', user.branch || user.department);
    }
  }
  return filter;
}

function cohortCourseFilter(user, adminId) {
  const filter = {
    createdByAdmin: adminId,
    institutionType: getInstitutionTypeFilter(user.institutionType)
  };
  if (user.institutionType === 'school') filter.standard = user.standard;
  else if (user.institutionType === 'pu_college') {
    filter.pucYear = user.pucYear;
    filter.pucDept = user.pucDept;
  } else {
    filter.branch = user.branch || user.department;
    filter.semester = user.semester;
  }
  const section = String(user.division || user.section || '').toUpperCase();
  if (section) filter.section = section;
  return filter;
}

exports.getEvents = async (req, res) => {
  try {
    const adminId = getTenantAdminId(req.user);
    if (!adminId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const filter = {
      adminId,
      institutionType: getInstitutionTypeFilter(req.user.institutionType || 'institute'),
      ...cohortEventFilter(req.user)
    };
    const events = await AcademicEvent.find(filter).sort({ startDate: 1 }).limit(500);
    return res.json({ success: true, events });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createEvent = async (req, res) => {
  try {
    const adminId = getTenantAdminId(req.user);
    if (!adminId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const institutionType = normalizeInstitutionType(req.user.institutionType || 'institute');
    const { title, description, category, startDate, endDate, branch, semester, standard, pucYear, pucDept, division } = req.body;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!title?.trim() || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return res.status(400).json({ success: false, message: 'Enter a title and valid start/end dates.' });
    }
    if (!['holiday', 'exam', 'event'].includes(category || 'event')) {
      return res.status(400).json({ success: false, message: 'Choose a valid calendar category.' });
    }
    const institution = INSTITUTIONS[institutionType];
    if (!institution) return res.status(400).json({ success: false, message: 'Unsupported institution type.' });
    if ((institutionType === 'institute' || institutionType === 'diploma') &&
        (branch && !institution.branches.includes(branch))) {
      return res.status(400).json({ success: false, message: 'Choose a department from your institution.' });
    }
    if (institutionType === 'school' && standard && !institution.standards.includes(standard)) {
      return res.status(400).json({ success: false, message: 'Choose a valid school standard.' });
    }
    if (institutionType === 'pu_college' &&
        ((pucYear && !institution.pucYears.includes(pucYear)) || (pucDept && !institution.pucDepts.includes(pucDept)))) {
      return res.status(400).json({ success: false, message: 'Choose a valid PUC cohort.' });
    }
    const event = await AcademicEvent.create({
      adminId,
      institutionType,
      title: title.trim(),
      description,
      category: category || 'event',
      startDate: start,
      endDate: end,
      branch: branch || '',
      semester: semester ? Number(semester) : null,
      standard: standard || '',
      pucYear: pucYear || '',
      pucDept: pucDept || '',
      division: division || ''
    });
    return res.status(201).json({ success: true, event });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const adminId = getTenantAdminId(req.user);
    const deleted = await AcademicEvent.findOneAndDelete({ _id: req.params.id, adminId });
    if (!deleted) return res.status(404).json({ success: false, message: 'Calendar event not found.' });
    return res.json({ success: true, message: 'Calendar event deleted.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPosts = async (req, res) => {
  try {
    const adminId = getTenantAdminId(req.user);
    if (!adminId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const base = {
      adminId,
      institutionType: getInstitutionTypeFilter(req.user.institutionType || 'institute')
    };
    let filter;
    if (req.user.role === 'admin') {
      filter = base;
    } else if (req.user.role === 'teacher') {
      filter = { ...base, $or: [{ authorRole: 'admin' }, { author: req.user._id }] };
    } else if (req.user.role === 'student') {
      const student = await User.findById(req.user._id);
      if (!student) return res.status(404).json({ success: false, message: 'Student account not found.' });
      const courses = await Course.find(cohortCourseFilter(student, adminId)).select('_id enrolledStudents');
      const courseIds = courses.filter(course =>
        !course.enrolledStudents.length || course.enrolledStudents.some(id => id.toString() === student._id.toString())
      ).map(course => course._id);
      filter = { ...base, $or: [{ authorRole: 'admin', course: null }, { course: { $in: courseIds } }] };
    } else {
      return res.status(403).json({ success: false, message: 'Posts are not available for this role.' });
    }
    const posts = await LearningPost.find(filter)
      .populate('author', 'name role')
      .populate('course', 'code title section branch semester standard pucYear pucDept')
      .sort({ createdAt: -1 })
      .limit(250);
    const visiblePosts = req.user.role === 'student'
      ? posts.map(post => {
          const item = post.toObject();
          item.questions = item.questions.map(({ prompt, options }) => ({ prompt, options }));
          return item;
        })
      : posts;
    return res.json({ success: true, posts: visiblePosts });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createPost = async (req, res) => {
  try {
    const adminId = getTenantAdminId(req.user);
    if (!adminId) return res.status(403).json({ success: false, message: 'Institution ownership is required.' });
    const { type, title, body, courseId } = req.body;
    if (!title?.trim() || !['announcement', 'material', 'quiz'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Enter a title and valid post type.' });
    }
    let course = null;
    if (req.user.role === 'admin') {
      if (type !== 'announcement' || courseId) {
        return res.status(400).json({ success: false, message: 'Admins can publish institution-wide announcements.' });
      }
    } else if (req.user.role === 'teacher') {
      if (!courseId) return res.status(400).json({ success: false, message: 'Select one of your assigned courses.' });
      course = await Course.findOne({
        _id: courseId,
        teacher: req.user._id,
        createdByAdmin: adminId,
        institutionType: getInstitutionTypeFilter(req.user.institutionType || 'institute')
      });
      if (!course) return res.status(403).json({ success: false, message: 'You can only post to courses assigned to you.' });
    } else {
      return res.status(403).json({ success: false, message: 'Only admins and teachers can publish posts.' });
    }

    let questions = [];
    if (type === 'quiz') {
      try {
        questions = JSON.parse(req.body.questions || '[]');
      } catch {
        return res.status(400).json({ success: false, message: 'Quiz questions must be valid JSON.' });
      }
      if (!Array.isArray(questions) || !questions.length ||
          questions.some(question => !question.prompt?.trim() || !Array.isArray(question.options) ||
            question.options.length < 2 || !question.options.includes(question.correctAnswer))) {
        return res.status(400).json({ success: false, message: 'Each quiz question needs a prompt, at least two options, and a valid correct answer.' });
      }
    }
    const attachmentUrl = req.body.attachmentUrl || (req.file ? await saveUploadedFile(req.file, 'materials') : '');
    const post = await LearningPost.create({
      adminId,
      institutionType: normalizeInstitutionType(req.user.institutionType || 'institute'),
      author: req.user._id,
      authorRole: req.user.role,
      course: course?._id || null,
      type,
      title: title.trim(),
      body: body || '',
      attachmentUrl,
      questions
    });
    return res.status(201).json({ success: true, post });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const adminId = getTenantAdminId(req.user);
    const filter = { _id: req.params.id, adminId };
    if (req.user.role === 'teacher') filter.author = req.user._id;
    const deleted = await LearningPost.findOneAndDelete(filter);
    if (!deleted) return res.status(404).json({ success: false, message: 'Post not found or access denied.' });
    return res.json({ success: true, message: 'Post deleted.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
