/**
 * HostelCare — File Storage and Image Processing Utility
 * Handles path traversal defense, file signature verification,
 * EXIF metadata stripping, image re-encoding, and atomic cleanup.
 */

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root uploads directory: backend/uploads/
export const UPLOAD_ROOT = path.resolve(__dirname, '..', '..', 'uploads');
export const COMPLAINTS_UPLOAD_DIR = path.join(UPLOAD_ROOT, 'complaints');

// Ensure storage directory exists
if (!fs.existsSync(COMPLAINTS_UPLOAD_DIR)) {
  fs.mkdirSync(COMPLAINTS_UPLOAD_DIR, { recursive: true });
}

/**
 * Safely unlinks a file from disk without throwing unhandled exceptions
 * @param {string} filePath Path to file to delete
 * @returns {Promise<boolean>} True if file was deleted, false if file did not exist or error occurred
 */
export async function unlinkFileSafely(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return false;
    }
    if (!fs.existsSync(filePath)) {
      return false;
    }
    await fs.promises.unlink(filePath);
    return true;
  } catch (err) {
    console.error('Warning: Failed to unlink file:', filePath, err.message);
    return false;
  }
}

/**
 * Validates that a storage key resolves within the allowed private upload directory
 * Completely prevents path traversal (e.g. ../../etc/passwd)
 * @param {string} storageKey 
 * @returns {string} Safe absolute file path
 */
export function resolveSafeStoragePath(storageKey) {
  if (!storageKey || typeof storageKey !== 'string') {
    throw new Error('Invalid storage key parameter.');
  }

  // Normalize path and remove any relative upward traversal tokens
  const sanitizedKey = storageKey.replace(/^(\.\.[\/\\])+/, '');
  const absolutePath = path.resolve(UPLOAD_ROOT, sanitizedKey);

  // Guard: resolved path must strictly reside inside UPLOAD_ROOT
  if (!absolutePath.startsWith(UPLOAD_ROOT)) {
    throw new Error('Access Denied: Path traversal detected.');
  }

  return absolutePath;
}

/**
 * Inspects file signatures (magic bytes) to verify genuine image content
 * @param {Buffer} buffer 
 * @returns {string|null} Detected MIME type or null
 */
export function detectMagicBytes(buffer) {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return 'image/png';
  }

  // WEBP: RIFF....WEBP
  if (
    buffer.toString('utf8', 0, 4) === 'RIFF' &&
    buffer.toString('utf8', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Validates, strips EXIF metadata, and re-encodes uploaded images using Sharp
 * @param {Buffer} buffer Raw image buffer
 * @param {string} originalName Original client filename
 * @returns {Promise<{ processedBuffer: Buffer, mimeType: string, extension: string, sizeBytes: number }>}
 */
export async function validateAndProcessImage(buffer, originalName = '') {
  if (!buffer || buffer.length === 0) {
    const error = new Error('Empty file received.');
    error.statusCode = 400;
    error.code = 'EMPTY_FILE';
    throw error;
  }

  // 1. Verify file signature (magic bytes)
  const detectedMime = detectMagicBytes(buffer);
  if (!detectedMime) {
    const error = new Error('File signature verification failed. Only genuine JPEG, PNG, and WEBP images are permitted.');
    error.statusCode = 415;
    error.code = 'INVALID_IMAGE_SIGNATURE';
    throw error;
  }

  // 2. Decode and inspect raster content using Sharp
  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (decodeErr) {
    const error = new Error('Image decoding failed. The uploaded file is corrupted or not a valid image.');
    error.statusCode = 415;
    error.code = 'CORRUPTED_IMAGE';
    throw error;
  }

  if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
    const error = new Error(`Unsupported image format: ${metadata.format}. Only JPEG, PNG, and WEBP images are permitted.`);
    error.statusCode = 415;
    error.code = 'UNSUPPORTED_MEDIA_TYPE';
    throw error;
  }

  // 3. Re-encode image and strip all EXIF metadata (GPS, device info, comment injections)
  let processedBuffer;
  let finalMimeType;
  let extension;

  if (metadata.format === 'jpeg') {
    processedBuffer = await sharp(buffer)
      .rotate() // Auto-orient based on orientation tag before stripping EXIF
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    finalMimeType = 'image/jpeg';
    extension = '.jpg';
  } else if (metadata.format === 'png') {
    processedBuffer = await sharp(buffer)
      .png({ compressionLevel: 8 })
      .toBuffer();
    finalMimeType = 'image/png';
    extension = '.png';
  } else if (metadata.format === 'webp') {
    processedBuffer = await sharp(buffer)
      .webp({ quality: 85 })
      .toBuffer();
    finalMimeType = 'image/webp';
    extension = '.webp';
  }

  return {
    processedBuffer,
    mimeType: finalMimeType,
    extension,
    sizeBytes: processedBuffer.length
  };
}

/**
 * Generates an unpredictable server-side filename using cryptographic randomness
 * @param {string} extension Verified file extension (e.g. '.jpg')
 * @returns {string} Sanitized unique filename
 */
export function generateRandomFilename(extension) {
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(12).toString('hex');
  return `complaint-${timestamp}-${randomHex}${extension}`;
}

export default {
  UPLOAD_ROOT,
  COMPLAINTS_UPLOAD_DIR,
  unlinkFileSafely,
  resolveSafeStoragePath,
  detectMagicBytes,
  validateAndProcessImage,
  generateRandomFilename
};
