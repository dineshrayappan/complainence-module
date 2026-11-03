const express = require('express');
const router = express.Router();
const {
  getCertificates,
  getCertificateById,
  createCertificate,
  updateCertificate,
  deleteCertificate,
  downloadCertificate,
} = require('../controllers/certificateController');
const { verifyToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Catch upload errors gracefully
const safeUploadDocument = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      console.warn('[Multer:uploadCertificate] Warning:', err.message);
      return res.status(400).json({
        success: false,
        message: `File upload error: ${err.message}`,
      });
    }
    next();
  });
};

// All Certificate routes are strictly restricted to Admin & Owner roles
router.use(verifyToken);
router.use(requireRole(['ADMIN', 'OWNER', 'SUPERADMIN']));

// List certificates & Create certificate
router.route('/')
  .get(getCertificates)
  .post(safeUploadDocument, createCertificate);

// Certificate Download
router.get('/:id/download', downloadCertificate);

// Single certificate operations
router.route('/:id')
  .get(getCertificateById)
  .put(safeUploadDocument, updateCertificate)
  .patch(safeUploadDocument, updateCertificate)
  .delete(deleteCertificate);

module.exports = router;

