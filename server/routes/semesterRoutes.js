const express = require('express');
const router  = express.Router();
const sc      = require('../controllers/semesterController');
const { requireAuth, isAdmin } = require('../middleware/auth');

router.get('/config',        requireAuth, sc.getInstitutionConfig);
router.get('/',              requireAuth, sc.getSemesters);
router.post('/',             requireAuth, isAdmin, sc.createSemester);
router.put('/:id',           requireAuth, isAdmin, sc.updateSemester);
router.post('/:id/lock',     requireAuth, isAdmin, sc.lockSemester);
router.post('/:id/unlock',   requireAuth, isAdmin, sc.unlockSemester);
router.delete('/:id',        requireAuth, isAdmin, sc.deleteSemester);
router.post('/:id/subjects', requireAuth, isAdmin, sc.addSubjects);
router.delete('/:id/subjects/:subjectCode', requireAuth, isAdmin, sc.removeSubject);

module.exports = router;
