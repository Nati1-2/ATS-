import mongoose from 'mongoose';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Parse `data` with a zod schema, throwing a 400 with per-field messages on failure. */
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    throw new HttpError(400, 'Please correct the highlighted fields', fields);
  }
  return result.data;
}

export function assertObjectId(id, what = 'Resource') {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, `${what} not found`);
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
