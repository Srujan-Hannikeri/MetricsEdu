const express = require('express');
const router = express.Router();
const controller = require('../controllers/campusController');
const materialUpload = require('../middleware/materialUpload');
const { requireAuth, isAdmin } = require('../middleware/auth');
const { handleUpload } = require('@vercel/blob/client');

router.get('/events', requireAuth, controller.getEvents);
router.post('/events', requireAuth, isAdmin, controller.createEvent);
router.delete('/events/:id', requireAuth, isAdmin, controller.deleteEvent);
router.get('/posts', requireAuth, controller.getPosts);
router.post('/blob-upload', requireAuth, async (req, res, next) => {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN is required to upload files on Vercel.');
    }
    const categories = {
      students: {
        roles: ['student'],
        contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maximumSizeInBytes: 10 * 1024 * 1024
      },
      classroom: {
        roles: ['teacher', 'admin'],
        contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maximumSizeInBytes: 20 * 1024 * 1024
      },
      materials: {
        roles: ['teacher'],
        contentTypes: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain',
          'image/jpeg',
          'image/png',
          'image/webp'
        ],
        maximumSizeInBytes: 20 * 1024 * 1024
      }
    };
    const result = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const category = categories[clientPayload];
        if (!category || !category.roles.includes(req.user.role)) {
          throw new Error('You are not allowed to upload this file type.');
        }
        if (!pathname.startsWith(`${clientPayload}/`)) {
          throw new Error('Invalid upload destination.');
        }
        return {
          allowedContentTypes: category.contentTypes,
          maximumSizeInBytes: category.maximumSizeInBytes,
          addRandomSuffix: true
        };
      }
    });
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});
router.post('/posts', requireAuth, (req, res, next) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Only admins and teachers can publish posts.' });
  }
  next();
}, materialUpload.single('attachment'), controller.createPost);
router.delete('/posts/:id', requireAuth, (req, res, next) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Only admins and teachers can delete posts.' });
  }
  next();
}, controller.deletePost);

module.exports = router;
