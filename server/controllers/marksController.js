const mongoose = require('mongoose');
const StudentMark = require('../models/StudentMark');
const Course = require('../models/Course');
const User = require('../models/User');
const QuizSubmission = require('../models/QuizSubmission');
const LearningPost = require('../models/LearningPost');
const { getTenantAdminId, getInstitutionTypeFilter } = require('../config/institutions');

// Helper to sanitize score input
function parseNumeric(val, defaultVal = 0) {
  const num = parseFloat(val);
  return isNaN(num) ? defaultVal : num;
}

// Automatically sync quiz submissions for a student into StudentMark
async function syncQuizzesForStudent(studentId, adminId) {
  try {
    const submissions = await QuizSubmission.find({ student: studentId }).populate('post').lean();
    if (!submissions || submissions.length === 0) return;

    const student = await User.findById(studentId).lean();
    if (!student) return;

    for (const sub of submissions) {
      if (!sub.post || sub.post.type !== 'quiz') continue;
      const post = sub.post;
      const quizTitle = `Quiz: ${post.title}`;

      const existing = await StudentMark.findOne({
        student: studentId,
        assessmentName: quizTitle
      }).lean();

      if (!existing) {
        let courseObj = null;
        if (post.course) {
          courseObj = await Course.findById(post.course).select('code title teacher').lean();
        }
        const teacherUser = post.author ? await User.findById(post.author).select('name').lean() : null;
        const totalQ = sub.totalQuestions || post.questions?.length || 1;
        const score = sub.score || 0;
        const pct = sub.percentage !== undefined ? sub.percentage : (totalQ > 0 ? Math.round((score / totalQ) * 100) : 0);
        const { grade } = StudentMark.calculateGrade(score, totalQ, 'Present');

        await StudentMark.create({
          adminId: post.adminId || adminId || student.createdByAdmin,
          institutionType: post.institutionType || student.institutionType || 'institute',
          course: post.course || null,
          courseCode: courseObj?.code || 'QUIZ',
          courseTitle: courseObj?.title || post.title,
          teacher: post.author || courseObj?.teacher || studentId,
          teacherName: teacherUser?.name || 'Faculty Quiz',
          student: studentId,
          studentName: student.name,
          studentUsn: student.usn || '',
          division: (student.division || 'A').toUpperCase(),
          semester: student.semester || null,
          branch: student.branch || '',
          standard: student.standard || '',
          pucYear: student.pucYear || '',
          pucDept: student.pucDept || '',
          assessmentName: quizTitle,
          assessmentType: 'quiz',
          score,
          maxScore: totalQ,
          percentage: pct,
          grade,
          status: 'Present',
          remarks: `Automatically synced from quiz submission (${score}/${totalQ} correct)`,
          examDate: sub.submittedAt || sub.createdAt || new Date()
        });
      }
    }
  } catch (err) {
    console.error('syncQuizzesForStudent error:', err);
  }
}

/**
 * GET /api/marks/teacher-courses
 * Returns courses accessible to the user (assigned courses for teacher, all courses for admin)
 */
exports.getTeacherCourses = async (req, res) => {
  try {
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership required' });
    }

    const instType = req.user.institutionType || 'institute';
    const typeFilter = getInstitutionTypeFilter(instType);

    const query = {
      createdByAdmin: tenantAdminId,
      institutionType: typeFilter
    };

    if (req.user.role === 'teacher') {
      query.teacher = req.user._id;
    }

    const courses = await Course.find(query)
      .populate('teacher', 'name teacherId email')
      .populate('enrolledStudents', 'name usn division semester branch standard pucYear pucDept')
      .sort({ code: 1, title: 1 })
      .lean();

    // Enrich courses with unique divisions and past assessment names
    const enriched = await Promise.all(courses.map(async (c) => {
      const studentDivisions = Array.from(new Set(
        (c.enrolledStudents || [])
          .map(s => s.division)
          .filter(Boolean)
      )).sort();

      const assessmentNames = await StudentMark.distinct('assessmentName', {
        course: c._id
      });

      return {
        _id: c._id,
        code: c.code,
        title: c.title,
        branch: c.branch,
        semester: c.semester,
        standard: c.standard,
        pucYear: c.pucYear,
        pucDept: c.pucDept,
        section: c.section,
        teacher: c.teacher,
        enrolledCount: (c.enrolledStudents || []).length,
        divisions: studentDivisions.length > 0 ? studentDivisions : ['A'],
        pastAssessments: assessmentNames
      };
    }));

    return res.json({ success: true, courses: enriched });
  } catch (error) {
    console.error('getTeacherCourses error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/marks/roster
 * Fetches enrolled students for a course & division, along with any existing marks for an assessment
 */
exports.getAssessmentRoster = async (req, res) => {
  try {
    const { courseId, division, assessmentName } = req.query;
    if (!courseId) {
      return res.status(400).json({ success: false, message: 'courseId is required' });
    }

    const tenantAdminId = getTenantAdminId(req.user);
    const course = await Course.findById(courseId)
      .populate('teacher', 'name teacherId email')
      .populate('enrolledStudents', 'name usn division semester branch standard pucYear pucDept profileImage');

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Permission check
    if (req.user.role === 'teacher' && course.teacher?._id?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this course.' });
    }

    // Filter students by division if requested
    let students = (course.enrolledStudents || []);
    if (division && division !== 'ALL') {
      students = students.filter(s => (s.division || 'A').toUpperCase() === division.toUpperCase());
    }

    // Sort students by USN or Name
    students.sort((a, b) => {
      if (a.usn && b.usn) return a.usn.localeCompare(b.usn);
      return a.name.localeCompare(b.name);
    });

    const studentIds = students.map(s => s._id);

    // Fetch existing marks if assessmentName is provided
    let existingMarksMap = {};
    let existingAssessmentInfo = null;

    if (assessmentName && assessmentName.trim()) {
      const marks = await StudentMark.find({
        course: courseId,
        assessmentName: assessmentName.trim(),
        student: { $in: studentIds }
      }).lean();

      if (marks.length > 0) {
        existingAssessmentInfo = {
          assessmentName: marks[0].assessmentName,
          assessmentType: marks[0].assessmentType,
          maxScore: marks[0].maxScore,
          examDate: marks[0].examDate
        };
      }

      marks.forEach(m => {
        existingMarksMap[m.student.toString()] = {
          score: m.score,
          maxScore: m.maxScore,
          percentage: m.percentage,
          grade: m.grade,
          status: m.status,
          remarks: m.remarks,
          updatedAt: m.updatedAt
        };
      });
    }

    const roster = students.map(s => {
      const existing = existingMarksMap[s._id.toString()] || null;
      return {
        _id: s._id,
        name: s.name,
        usn: s.usn,
        division: s.division || 'A',
        branch: s.branch,
        semester: s.semester,
        standard: s.standard,
        pucYear: s.pucYear,
        pucDept: s.pucDept,
        profileImage: s.profileImage,
        mark: existing
      };
    });

    return res.json({
      success: true,
      course: {
        _id: course._id,
        code: course.code,
        title: course.title,
        teacher: course.teacher,
        branch: course.branch,
        semester: course.semester,
        standard: course.standard,
        pucYear: course.pucYear,
        pucDept: course.pucDept
      },
      assessmentInfo: existingAssessmentInfo,
      roster
    });
  } catch (error) {
    console.error('getAssessmentRoster error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/marks/batch-save
 * Batch saves or edits student marks for an assessment
 */
exports.batchSaveMarks = async (req, res) => {
  try {
    const {
      courseId,
      assessmentName,
      assessmentType = 'internal',
      maxScore = 100,
      examDate,
      entries = []
    } = req.body;

    if (!courseId || !assessmentName || !assessmentName.trim()) {
      return res.status(400).json({ success: false, message: 'Course ID and Assessment Name are required.' });
    }

    const cleanAssessmentName = assessmentName.trim();
    const cleanMaxScore = Math.max(1, parseNumeric(maxScore, 100));

    const tenantAdminId = getTenantAdminId(req.user);
    const course = await Course.findById(courseId).populate('teacher', 'name');

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Permission check
    if (req.user.role === 'teacher' && course.teacher?._id?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You are not assigned to record marks for this course.' });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, message: 'No student marks provided to save.' });
    }

    const dateToUse = examDate ? new Date(examDate) : new Date();
    const studentIds = entries.map(e => e.studentId).filter(Boolean);
    const students = await User.find({ _id: { $in: studentIds } }).lean();
    const studentMap = new Map(students.map(s => [s._id.toString(), s]));

    const bulkOps = [];
    for (const item of entries) {
      if (!item.studentId) continue;
      const student = studentMap.get(item.studentId.toString());
      if (!student) continue;

      const status = item.status === 'Absent' || item.status === 'Exempted' ? item.status : 'Present';
      const rawScore = parseNumeric(item.score, 0);
      const score = status === 'Absent' ? 0 : Math.min(cleanMaxScore, Math.max(0, rawScore));
      const { percentage, grade } = StudentMark.calculateGrade(score, cleanMaxScore, status);

      bulkOps.push({
        updateOne: {
          filter: {
            student: student._id,
            course: course._id,
            assessmentName: cleanAssessmentName
          },
          update: {
            $set: {
              adminId: tenantAdminId,
              institutionType: course.institutionType || student.institutionType || 'institute',
              course: course._id,
              courseCode: course.code,
              courseTitle: course.title,
              teacher: req.user.role === 'teacher' ? req.user._id : (course.teacher?._id || req.user._id),
              teacherName: req.user.role === 'teacher' ? req.user.name : (course.teacher?.name || req.user.name),
              student: student._id,
              studentName: student.name,
              studentUsn: student.usn || '',
              division: (student.division || 'A').toUpperCase(),
              semester: student.semester || course.semester || null,
              branch: student.branch || course.branch || '',
              standard: student.standard || course.standard || '',
              pucYear: student.pucYear || course.pucYear || '',
              pucDept: student.pucDept || course.pucDept || '',
              assessmentName: cleanAssessmentName,
              assessmentType,
              score,
              maxScore: cleanMaxScore,
              percentage,
              grade,
              status,
              remarks: (item.remarks || '').trim(),
              examDate: dateToUse
            }
          },
          upsert: true
        }
      });
    }

    if (bulkOps.length > 0) {
      await StudentMark.bulkWrite(bulkOps);
    }

    return res.json({
      success: true,
      message: `Successfully saved marks for ${bulkOps.length} student(s).`,
      savedCount: bulkOps.length,
      assessmentName: cleanAssessmentName
    });
  } catch (error) {
    console.error('batchSaveMarks error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/marks/overview
 * Overview of marks across students, filtered by course, division, or cohort
 */
exports.getMarksOverview = async (req, res) => {
  try {
    const tenantAdminId = getTenantAdminId(req.user);
    if (!tenantAdminId) {
      return res.status(403).json({ success: false, message: 'Institution ownership required' });
    }

    const {
      courseId,
      division,
      semester,
      branch,
      standard,
      pucYear,
      pucDept,
      assessmentName,
      search
    } = req.query;

    const query = {
      adminId: tenantAdminId
    };

    if (req.user.role === 'teacher') {
      // Find courses assigned to this teacher
      const myCourseIds = await Course.find({
        teacher: req.user._id,
        createdByAdmin: tenantAdminId
      }).distinct('_id');

      if (courseId) {
        query.course = courseId;
      } else {
        query.course = { $in: myCourseIds };
      }
    } else {
      if (courseId) query.course = courseId;
    }

    if (division && division !== 'ALL') query.division = division.toUpperCase();
    if (semester && semester !== 'ALL') query.semester = parseInt(semester, 10);
    if (branch && branch !== 'ALL') query.branch = branch;
    if (standard && standard !== 'ALL') query.standard = standard;
    if (pucYear && pucYear !== 'ALL') query.pucYear = pucYear;
    if (pucDept && pucDept !== 'ALL') query.pucDept = pucDept;
    if (assessmentName && assessmentName !== 'ALL') query.assessmentName = assessmentName;

    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { studentName: { $regex: term, $options: 'i' } },
        { studentUsn: { $regex: term, $options: 'i' } },
        { courseCode: { $regex: term, $options: 'i' } },
        { assessmentName: { $regex: term, $options: 'i' } }
      ];
    }

    const marks = await StudentMark.find(query)
      .sort({ examDate: -1, createdAt: -1 })
      .limit(500)
      .lean();

    // Group marks by student for convenient tabular viewing
    const studentGroupMap = new Map();
    marks.forEach(m => {
      const sid = m.student.toString();
      if (!studentGroupMap.has(sid)) {
        studentGroupMap.set(sid, {
          studentId: sid,
          studentName: m.studentName,
          studentUsn: m.studentUsn,
          division: m.division,
          branch: m.branch,
          semester: m.semester,
          standard: m.standard,
          pucYear: m.pucYear,
          pucDept: m.pucDept,
          marksList: [],
          totalScore: 0,
          totalMaxScore: 0,
          count: 0
        });
      }
      const grp = studentGroupMap.get(sid);
      grp.marksList.push(m);
      if (m.status !== 'Absent' && m.status !== 'Exempted') {
        grp.totalScore += m.score;
        grp.totalMaxScore += m.maxScore;
        grp.count += 1;
      }
    });

    const studentsOverview = Array.from(studentGroupMap.values()).map(grp => {
      const avgPercentage = grp.totalMaxScore > 0
        ? Math.round((grp.totalScore / grp.totalMaxScore) * 1000) / 10
        : 0;
      return {
        studentId: grp.studentId,
        studentName: grp.studentName,
        studentUsn: grp.studentUsn,
        division: grp.division,
        branch: grp.branch,
        semester: grp.semester,
        standard: grp.standard,
        pucYear: grp.pucYear,
        pucDept: grp.pucDept,
        assessmentsCount: grp.marksList.length,
        avgPercentage,
        overallGrade: StudentMark.calculateGrade(grp.totalScore, grp.totalMaxScore || 100).grade,
        recentMarks: grp.marksList.slice(0, 5)
      };
    });

    // Summary statistics
    const totalRecords = marks.length;
    const avgScore = totalRecords > 0
      ? Math.round(marks.reduce((acc, m) => acc + (m.percentage || 0), 0) / totalRecords * 10) / 10
      : 0;
    const passCount = marks.filter(m => m.grade !== 'F' && m.grade !== 'AB').length;
    const passRate = totalRecords > 0 ? Math.round((passCount / totalRecords) * 100) : 0;

    res.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=60');
    return res.json({
      success: true,
      summary: {
        totalMarksRecords: totalRecords,
        uniqueStudents: studentsOverview.length,
        averagePercentage: avgScore,
        passRate
      },
      students: studentsOverview,
      rawMarks: marks
    });
  } catch (error) {
    console.error('getMarksOverview error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/marks/student/:studentId
 * Returns complete marks history and computed analytics for graphing and deep-dive
 */
exports.getStudentMarksHistory = async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!studentId) {
      return res.status(400).json({ success: false, message: 'Student ID required' });
    }

    const student = await User.findById(studentId).lean();
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Automatically sync any quizzes taken by the student
    await syncQuizzesForStudent(studentId, req.user?.createdByAdmin || req.user?._id);

    // Fetch all marks for this student
    const marks = await StudentMark.find({ student: studentId })
      .sort({ examDate: 1, createdAt: 1 })
      .lean();

    // 1. Overall Stats
    let totalScore = 0;
    let totalMaxScore = 0;
    let passedCount = 0;
    let failedCount = 0;
    let absentCount = 0;
    let highestPct = 0;
    let lowestPct = marks.length > 0 ? 100 : 0;

    marks.forEach(m => {
      if (m.status === 'Absent') {
        absentCount++;
        failedCount++;
      } else {
        totalScore += m.score;
        totalMaxScore += m.maxScore;
        const pct = m.percentage || 0;
        if (pct > highestPct) highestPct = pct;
        if (pct < lowestPct) lowestPct = pct;
        if (m.grade === 'F') {
          failedCount++;
        } else {
          passedCount++;
        }
      }
    });

    const cumulativePercentage = totalMaxScore > 0
      ? Math.round((totalScore / totalMaxScore) * 1000) / 10
      : 0;

    const overallGrade = StudentMark.calculateGrade(totalScore, totalMaxScore || 100).grade;

    // 2. Trajectory Timeline (Chronological progression for line chart)
    const trajectory = marks.map((m, idx) => ({
      index: idx + 1,
      date: m.examDate ? new Date(m.examDate).toLocaleDateString() : '',
      assessmentName: m.assessmentName,
      assessmentType: m.assessmentType,
      courseCode: m.courseCode,
      courseTitle: m.courseTitle,
      score: m.score,
      maxScore: m.maxScore,
      percentage: m.percentage,
      grade: m.grade,
      status: m.status,
      remarks: m.remarks
    }));

    // 3. Subject Breakdown (Grouped by Course)
    const subjectMap = new Map();
    marks.forEach(m => {
      const code = m.courseCode || 'GENERAL';
      if (!subjectMap.has(code)) {
        subjectMap.set(code, {
          courseCode: code,
          courseTitle: m.courseTitle,
          teacherName: m.teacherName,
          totalScore: 0,
          totalMaxScore: 0,
          testsCount: 0,
          scores: []
        });
      }
      const entry = subjectMap.get(code);
      entry.testsCount++;
      if (m.status !== 'Absent') {
        entry.totalScore += m.score;
        entry.totalMaxScore += m.maxScore;
        entry.scores.push(m.percentage);
      }
    });

    const subjectBreakdown = Array.from(subjectMap.values()).map(sub => {
      const avg = sub.totalMaxScore > 0
        ? Math.round((sub.totalScore / sub.totalMaxScore) * 1000) / 10
        : 0;
      const highest = sub.scores.length > 0 ? Math.max(...sub.scores) : 0;
      const lowest = sub.scores.length > 0 ? Math.min(...sub.scores) : 0;
      return {
        courseCode: sub.courseCode,
        courseTitle: sub.courseTitle,
        teacherName: sub.teacherName,
        testsCount: sub.testsCount,
        avgPercentage: avg,
        highestScore: highest,
        lowestScore: lowest,
        grade: StudentMark.calculateGrade(sub.totalScore, sub.totalMaxScore || 100).grade
      };
    });

    // 4. Assessment Type Breakdown
    const typeMap = new Map();
    marks.forEach(m => {
      const type = m.assessmentType || 'internal';
      if (!typeMap.has(type)) {
        typeMap.set(type, { count: 0, totalScore: 0, totalMaxScore: 0 });
      }
      const tEntry = typeMap.get(type);
      tEntry.count++;
      if (m.status !== 'Absent') {
        tEntry.totalScore += m.score;
        tEntry.totalMaxScore += m.maxScore;
      }
    });

    const typeBreakdown = Array.from(typeMap.entries()).map(([type, val]) => ({
      type,
      count: val.count,
      avgPercentage: val.totalMaxScore > 0 ? Math.round((val.totalScore / val.totalMaxScore) * 1000) / 10 : 0
    }));

    res.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=60');
    return res.json({
      success: true,
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        usn: student.usn,
        division: student.division,
        semester: student.semester,
        branch: student.branch,
        standard: student.standard,
        pucYear: student.pucYear,
        pucDept: student.pucDept,
        profileImage: student.profileImage
      },
      stats: {
        totalAssessments: marks.length,
        cumulativePercentage,
        overallGrade,
        passedCount,
        failedCount,
        absentCount,
        highestPercentage: highestPct,
        lowestPercentage: marks.length > 0 ? lowestPct : 0
      },
      trajectory,
      subjectBreakdown,
      typeBreakdown,
      marks: [...marks].reverse() // Most recent first for tabular display
    });
  } catch (error) {
    console.error('getStudentMarksHistory error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
