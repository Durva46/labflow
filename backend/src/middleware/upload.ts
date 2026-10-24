import multer from 'multer';
import path from 'node:path';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

export const SUPPORTED_EXTENSIONS = new Set(['.xlsx', '.csv']);

const MIME_ALLOWLIST = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/octet-stream',
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/x-csv',
  '',
]);

/** Strips directories, control characters and length; never used as a path. */
export function sanitiseFilename(original: string): string {
  const base = path.basename(original.replace(/\\/g, '/'));
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[<>:"|?*]/g, '_');
  return cleaned.slice(0, 180) || 'upload';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_BYTES,
    files: 1,
    fields: 12,
    fieldSize: 32 * 1024,
    parts: 20,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return cb(new AppError(400, 'UNSUPPORTED_FILE_TYPE', 'Only .xlsx and .csv files are accepted.'));
    }
    if (!MIME_ALLOWLIST.has((file.mimetype || '').toLowerCase())) {
      return cb(new AppError(400, 'UNSUPPORTED_FILE_TYPE', 'The file type reported by the browser is not accepted.'));
    }
    return cb(null, true);
  },
});

export const uploadMonthlyReport = upload.single('file');
