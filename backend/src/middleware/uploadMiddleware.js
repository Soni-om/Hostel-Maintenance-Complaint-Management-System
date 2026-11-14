/**
 * HostelCare — Multer Upload Middleware
 * Enforces in-memory staging, 5MB size limit, single photo restriction,
 * and MIME type filtering before controller processing.
 */

import multer from 'multer';

// 5 MB maximum file size cap (5 * 1024 * 1024 bytes)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed image MIME types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Storage Engine: Memory storage (buffers file in memory for signature verification & EXIF stripping)
const memoryStorage = multer.memoryStorage();

// File filter for preliminary MIME-type inspection
const fileFilter = (req, file, cb) => {
  const mime = (file.mimetype || '').toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.includes(mime)) {
    const error = new Error('Unsupported image format. Only JPEG, PNG, and WEBP images are permitted.');
    error.statusCode = 415;
    error.code = 'UNSUPPORTED_MEDIA_TYPE';
    return cb(error, false);
  }
  cb(null, true);
};

// Multer instance with conservative multipart limits
const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Only one photo accepted per request
    fields: 20,
    fieldSize: 1024 * 1024,
    parts: 25 // Explicit multipart parts limit (SEC-11-LOW-01)
  },
  fileFilter
});

/**
 * Middleware: uploadSinglePhoto
 * Handles optional single file upload on field 'photo'.
 * Passes through non-multipart requests cleanly without error.
 */
export const uploadSinglePhoto = (req, res, next) => {
  const uploadHandler = upload.single('photo');

  uploadHandler(req, res, (err) => {
    if (err) {
      // Delegate to centralized error handler for consistent status codes
      return next(err);
    }
    next();
  });
};

export default {
  uploadSinglePhoto,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES
};
