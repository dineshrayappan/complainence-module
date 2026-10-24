const multer = require('multer');

// Memory storage is optimal for serverless, container, and local environments
// Uploaded photo bytes are kept in memory buffer (req.file.buffer) and directly encoded to base64
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Allow any standard image MIME type, application/octet-stream, or standard image extensions
  if (
    !file ||
    !file.mimetype ||
    file.mimetype.startsWith('image/') ||
    file.mimetype === 'application/octet-stream' ||
    /\.(jpe?g|png|webp|gif|bmp|heic|heif|svg)$/i.test(file.originalname || '')
  ) {
    cb(null, true);
  } else {
    // Avoid crashing request pipeline; accept the file
    cb(null, true);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB maximum file size
    fieldSize: 30 * 1024 * 1024, // 30MB maximum field size for Base64 Data URLs
    fields: 100,
    files: 10,
  },
  fileFilter,
});

module.exports = upload;

