const AcademicEvent = require('../models/AcademicEvent');
const LearningPost = require('../models/LearningPost');
const Course = require('../models/Course');
const User = require('../models/User');
const QuizSubmission = require('../models/QuizSubmission');
const StudentMark = require('../models/StudentMark');
const BugFeedback = require('../models/BugFeedback');
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
    const events = await AcademicEvent.find(filter).sort({ startDate: 1 }).limit(500).lean();
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
    let visiblePosts = posts.map(post => post.toObject());
    const quizPostIds = posts.filter(post => post.type === 'quiz').map(post => post._id);

    if (quizPostIds.length > 0) {
      if (req.user.role === 'student') {
        const submissions = await QuizSubmission.find({
          post: { $in: quizPostIds },
          student: req.user._id
        }).lean();
        const subMap = new Map(submissions.map(s => [s.post.toString(), s]));

        visiblePosts = visiblePosts.map(item => {
          if (item.type === 'quiz') {
            const sub = subMap.get(item._id.toString());
            if (sub) {
              item.mySubmission = {
                score: sub.score,
                totalQuestions: sub.totalQuestions,
                percentage: sub.percentage,
                answers: sub.answers,
                submittedAt: sub.submittedAt
              };
            } else {
              item.questions = item.questions.map(({ prompt, options }) => ({ prompt, options }));
            }
          }
          return item;
        });
      } else if (req.user.role === 'teacher' || req.user.role === 'admin') {
        const counts = await QuizSubmission.aggregate([
          { $match: { post: { $in: quizPostIds } } },
          { $group: { _id: '$post', count: { $sum: 1 } } }
        ]);
        const countMap = new Map(counts.map(c => [c._id.toString(), c.count]));

        visiblePosts = visiblePosts.map(item => {
          if (item.type === 'quiz') {
            item.submissionCount = countMap.get(item._id.toString()) || 0;
          }
          return item;
        });
      }
    }
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


exports.submitQuiz = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can submit quiz answers.' });
    }
    const { id } = req.params;
    const { answers } = req.body;

    const post = await LearningPost.findById(id);
    if (!post || post.type !== 'quiz') {
      return res.status(404).json({ success: false, message: 'Quiz not found.' });
    }

    if (!Array.isArray(answers) || !answers.length) {
      return res.status(400).json({ success: false, message: 'Answers are required.' });
    }

    let correctCount = 0;
    const processedAnswers = post.questions.map((q, idx) => {
      const studentAns = answers.find(a => a.questionIndex === idx);
      const selectedOption = studentAns?.selectedOption || '';
      const isCorrect = Boolean(selectedOption && selectedOption === q.correctAnswer);
      if (isCorrect) correctCount++;
      return {
        questionIndex: idx,
        selectedOption,
        isCorrect
      };
    });

    const totalQuestions = post.questions.length;
    const percentage = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    const studentUser = await User.findById(req.user._id).select('name usn email');

    const submission = await QuizSubmission.findOneAndUpdate(
      { post: post._id, student: req.user._id },
      {
        post: post._id,
        student: req.user._id,
        studentName: studentUser?.name || req.user.name,
        studentUsn: studentUser?.usn || '',
        studentEmail: studentUser?.email || req.user.email,
        answers: processedAnswers,
        score: correctCount,
        totalQuestions,
        percentage,
        submittedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // Automatically record quiz marks into StudentMark for analytics and faculty gradebook
    try {
      let courseObj = null;
      if (post.course) {
        courseObj = await Course.findById(post.course).select('code title teacher');
      }

      const fullStudent = await User.findById(req.user._id).select('name usn division semester branch standard pucYear pucDept institutionType createdByAdmin');
      const teacherUser = post.author ? await User.findById(post.author).select('name') : null;

      const { grade } = StudentMark.calculateGrade(correctCount, totalQuestions, 'Present');

      await StudentMark.findOneAndUpdate(
        {
          student: req.user._id,
          course: post.course || null,
          assessmentName: `Quiz: ${post.title}`
        },
        {
          $set: {
            adminId: post.adminId || fullStudent?.createdByAdmin,
            institutionType: post.institutionType || fullStudent?.institutionType || 'institute',
            course: post.course || null,
            courseCode: courseObj?.code || 'QUIZ',
            courseTitle: courseObj?.title || post.title,
            teacher: post.author || courseObj?.teacher || req.user._id,
            teacherName: teacherUser?.name || 'Faculty Quiz',
            student: req.user._id,
            studentName: fullStudent?.name || req.user.name,
            studentUsn: fullStudent?.usn || '',
            division: (fullStudent?.division || 'A').toUpperCase(),
            semester: fullStudent?.semester || null,
            branch: fullStudent?.branch || '',
            standard: fullStudent?.standard || '',
            pucYear: fullStudent?.pucYear || '',
            pucDept: fullStudent?.pucDept || '',
            assessmentName: `Quiz: ${post.title}`,
            assessmentType: 'quiz',
            score: correctCount,
            maxScore: totalQuestions,
            percentage,
            grade,
            status: 'Present',
            remarks: `Automatically uploaded from online quiz (${correctCount}/${totalQuestions} correct)`,
            examDate: new Date()
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } catch (markErr) {
      console.error('Error automatically uploading quiz marks to StudentMark:', markErr);
    }

    return res.json({
      success: true,
      message: `Quiz submitted successfully! You scored ${correctCount}/${totalQuestions} (${percentage}%).`,
      submission: {
        score: submission.score,
        totalQuestions: submission.totalQuestions,
        percentage: submission.percentage,
        answers: submission.answers,
        submittedAt: submission.submittedAt
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getQuizResults = async (req, res) => {
  try {
    const { id } = req.params;
    const post = await LearningPost.findById(id);
    if (!post || post.type !== 'quiz') {
      return res.status(404).json({ success: false, message: 'Quiz not found.' });
    }

    const adminId = getTenantAdminId(req.user);
    const isAuthor = post.author.toString() === req.user._id.toString();
    const isInstAdmin = req.user.role === 'admin' && post.adminId.toString() === adminId?.toString();

    if (!isAuthor && !isInstAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied. Only the teacher or admin can view quiz results.' });
    }

    const results = await QuizSubmission.find({ post: id })
      .sort({ score: -1, studentName: 1 })
      .lean();

    return res.json({
      success: true,
      quiz: {
        _id: post._id,
        title: post.title,
        totalQuestions: post.questions.length
      },
      results: results.map(r => ({
        _id: r._id,
        studentId: r.student,
        studentName: r.studentName,
        studentUsn: r.studentUsn,
        studentEmail: r.studentEmail,
        score: r.score,
        totalQuestions: r.totalQuestions,
        percentage: r.percentage,
        submittedAt: r.submittedAt
      }))
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.submitFeedback = async (req, res) => {
  try {
    const { type, title, description, severity, attachmentUrl, userName, userEmail } = req.body;
    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ success: false, message: 'Title and description are required.' });
    }

    let userRole = 'anonymous';
    let institutionName = 'Unspecified';
    let institutionType = '';
    let resolvedUserName = userName || 'Anonymous';
    let resolvedUserEmail = userEmail || '';

    if (req.user) {
      userRole = req.user.role;
      resolvedUserName = req.user.name || resolvedUserName;
      resolvedUserEmail = req.user.email || resolvedUserEmail;
      institutionType = req.user.institutionType || '';
      institutionName = req.user.institutionName || '';
      if (!institutionName && req.user.createdByAdmin) {
        const owner = await User.findById(req.user.createdByAdmin).select('name institutionName');
        institutionName = owner?.institutionName || owner?.name || '';
      }
    }

    const item = await BugFeedback.create({
      userId: req.user?._id || null,
      userName: resolvedUserName,
      userEmail: resolvedUserEmail,
      userRole,
      institutionName: institutionName || 'MetricsEdu Institution',
      institutionType,
      type: ['bug', 'feedback', 'feature'].includes(type) ? type : 'bug',
      title: title.trim(),
      description: description.trim(),
      severity: ['low', 'medium', 'high', 'critical'].includes(severity) ? severity : 'medium',
      attachmentUrl: attachmentUrl || ''
    });

    return res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully! Our developer team has received your report.',
      reportId: item._id
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
