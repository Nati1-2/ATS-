import { Activity } from '../models/index.js';

export const STAGE_LABELS = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
};

export function logActivity({ application, actor, type, message, meta }) {
  return Activity.create({
    candidate: application.candidate?._id ?? application.candidate,
    application: application._id,
    job: application.job?._id ?? application.job,
    actor: actor?._id,
    type,
    message,
    meta,
  });
}
