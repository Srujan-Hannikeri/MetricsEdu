const multer = require('multer');

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const fileFilter = (_req, file, cb) => {
  if (allowedImageTypes.has(file.mimetype)) return cb(null, true);
  cb(new Error('Only JPEG, PNG, and WebP images are allowed.'), false);
};

const uploadClassroom = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max for high-res classroom photos
  fileFilter
});

const uploadStudent = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter
});

module.exports = {
  uploadClassroom,
  uploadStudent
};
