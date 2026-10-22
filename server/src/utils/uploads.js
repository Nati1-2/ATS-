import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { HttpError } from './http.js';

// On Vercel only /tmp is writable (and it is not shared or kept between function instances)
export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : process.env.VERCEL
    ? '/tmp/ats-uploads'
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
fs.mkdirSync(path.join(UPLOAD_DIR, 'resumes'), { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'logos'), { recursive: true });

// Vercel rejects request bodies over 4.5 MB before they reach us, so leave room for the rest of the form there
const configuredResumeMb = Number(process.env.MAX_RESUME_MB || 5);
export const MAX_RESUME_MB = process.env.VERCEL ? Math.min(configuredResumeMb, 4) : configuredResumeMb;
const MAX_LOGO_MB = 2;

const GENERIC = ['application/octet-stream', ''];
const RESUME_TYPES = {
  // Some browsers/OSes send a generic type for these files; the real check is verifyResumeSignature().
  '.pdf': ['application/pdf', 'application/x-pdf', ...GENERIC],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', ...GENERIC],
  '.doc': ['application/msword', 'application/doc', 'application/vnd.ms-word', ...GENERIC],
  '.odt': ['application/vnd.oasis.opendocument.text', 'application/zip', ...GENERIC],
  '.rtf': ['application/rtf', 'text/rtf', 'application/x-rtf', 'text/richtext', ...GENERIC],
  '.txt': ['text/plain', ...GENERIC],
};
export const RESUME_EXTENSIONS = Object.keys(RESUME_TYPES);
/** Canonical type stored for each extension, whatever the browser sent. */
export const RESUME_MIME = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.rtf': 'application/rtf',
  '.txt': 'text/plain; charset=utf-8',
};

const LOGO_TYPES = {
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
  '.svg': ['image/svg+xml'],
};

function makeUploader(subdir, types, maxMb, label) {
  return multer({
    storage: multer.diskStorage({
      destination: path.join(UPLOAD_DIR, subdir),
      filename: (_req, file, cb) =>
        cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!types[ext] || !types[ext].includes(file.mimetype)) {
        return cb(new HttpError(400, `${label} must be one of: ${Object.keys(types).join(', ')}`, { [file.fieldname]: `Unsupported file type` }));
      }
      cb(null, true);
    },
  });
}

export const resumeUpload = makeUploader('resumes', RESUME_TYPES, MAX_RESUME_MB, 'Résumé');
export const logoUpload = makeUploader('logos', LOGO_TYPES, MAX_LOGO_MB, 'Logo');

/** Check file magic bytes so a renamed file can't masquerade as a PDF/DOCX. */
export function verifyResumeSignature(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(512);
  const n = fs.readSync(fd, buf, 0, 512, 0);
  fs.closeSync(fd);
  const head = buf.subarray(0, n);
  const ext = path.extname(filePath);
  if (ext === '.pdf') return head.toString('latin1', 0, 4) === '%PDF';
  if (ext === '.docx' || ext === '.odt') return head[0] === 0x50 && head[1] === 0x4b; // ZIP container
  if (ext === '.doc') return head.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])); // OLE2
  if (ext === '.rtf') return head.toString('latin1', 0, 5) === '{\\rtf';
  // Plain text: no NUL bytes and valid UTF-8
  if (ext === '.txt') {
    if (n === 0 || head.includes(0)) return false;
    try {
      // stream: true tolerates a multi-byte character cut off at the end of the sample
      new TextDecoder('utf-8', { fatal: true }).decode(head, { stream: true });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function removeFile(filePath) {
  fs.promises.unlink(filePath).catch(() => {});
}

// Kept files (résumés, logos) are stored in MongoDB (GridFS) so they survive restarts, redeploys and
// serverless instances (Vercel's /tmp is per instance). UPLOAD_DIR is only a local cache of them.
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'uploads' });
const storedName = (subdir, filename) => `${subdir}/${path.basename(filename)}`;
const localPath = (subdir, filename) => path.join(UPLOAD_DIR, subdir, path.basename(filename));

/** Save an uploaded file (from multer) to the database. */
export async function persistFile(subdir, file) {
  const upload = bucket().openUploadStream(storedName(subdir, file.filename), { metadata: { contentType: file.mimetype } });
  await pipeline(fs.createReadStream(file.path), upload);
}

/** Local path of a kept file, fetched from the database into the cache if needed; null when it does not exist. */
export async function fetchFile(subdir, filename) {
  const target = localPath(subdir, filename);
  if (fs.existsSync(target)) return target;
  const [doc] = await bucket().find({ filename: storedName(subdir, filename) }).limit(1).toArray();
  if (!doc) return null;
  const partial = `${target}.${crypto.randomUUID()}.part`;
  await pipeline(bucket().openDownloadStream(doc._id), fs.createWriteStream(partial));
  await fs.promises.rename(partial, target);
  return target;
}

/** Remove a kept file from the database and the local cache. */
export async function deleteStoredFile(subdir, filename) {
  removeFile(localPath(subdir, filename));
  const docs = await bucket().find({ filename: storedName(subdir, filename) }).toArray();
  await Promise.all(docs.map((d) => bucket().delete(d._id).catch(() => {})));
}
