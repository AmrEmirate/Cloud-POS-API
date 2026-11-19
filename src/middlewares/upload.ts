import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const rawExt = path.extname(path.basename(file.originalname)).toLowerCase();
    const safeExt = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : '.bin';
    const safeField = String(file.fieldname || 'file').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'file';
    cb(null, `${safeField}-${uniqueSuffix}${safeExt}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(path.basename(file.originalname)).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();

    if (ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIME_TYPES.has(mime)) {
      return cb(null, true);
    }
    cb(new Error('Format file tidak didukung! Hanya gambar JPEG, PNG, WEBP, atau PDF.'));
  },
});

/**
 * Inspects file magic bytes (binary signature) to prevent spoofed file extension/MIME attacks
 */
export const hasValidFileSignature = (buffer: Buffer): boolean => {
  if (!buffer || buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true;
  }

  // PDF: "%PDF"
  if (buffer.subarray(0, 4).toString('ascii') === '%PDF') {
    return true;
  }

  return false;
};

const validateSingleFileSignature = (filePath: string): boolean => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, header, 0, 12, 0);
    return hasValidFileSignature(header.subarray(0, bytesRead));
  } finally {
    fs.closeSync(fd);
  }
};

const safeUnlink = (filePath?: string) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  }
};

export const validateUploadedFileMagicBytes = (req: Request, res: Response, next: NextFunction) => {
  const uploadedFiles: Express.Multer.File[] = [];
  if (req.file) {
    uploadedFiles.push(req.file);
  }
  if (Array.isArray(req.files)) {
    uploadedFiles.push(...req.files);
  } else if (req.files && typeof req.files === 'object') {
    for (const fieldFiles of Object.values(req.files)) {
      if (Array.isArray(fieldFiles)) {
        uploadedFiles.push(...fieldFiles);
      }
    }
  }

  if (uploadedFiles.length === 0) {
    return next();
  }

  try {
    for (const file of uploadedFiles) {
      if (!file.path || !validateSingleFileSignature(file.path)) {
        uploadedFiles.forEach((f) => safeUnlink(f.path));
        return res.status(400).json({
          success: false,
          message: 'Isi file tidak valid atau terdeteksi sebagai file berbahaya (signature mismatch).',
        });
      }
    }
    return next();
  } catch {
    uploadedFiles.forEach((f) => safeUnlink(f.path));
    return res.status(400).json({
      success: false,
      message: 'Gagal memvalidasi keamanan file yang diunggah.',
    });
  }
};
