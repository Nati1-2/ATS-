export const STAGES = [
  { value: 'applied', label: 'Applied', badge: 'bg-slate-100 text-slate-700 ring-slate-300', dot: 'bg-slate-400' },
  { value: 'screening', label: 'Screening', badge: 'bg-sky-50 text-sky-800 ring-sky-300', dot: 'bg-sky-500' },
  { value: 'interview', label: 'Interview', badge: 'bg-indigo-50 text-indigo-800 ring-indigo-300', dot: 'bg-indigo-500' },
  { value: 'offer', label: 'Offer', badge: 'bg-amber-50 text-amber-800 ring-amber-300', dot: 'bg-amber-500' },
  { value: 'hired', label: 'Hired', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-300', dot: 'bg-emerald-500' },
  { value: 'rejected', label: 'Rejected', badge: 'bg-rose-50 text-rose-800 ring-rose-300', dot: 'bg-rose-500' },
];
export const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.value, s]));

export const JOB_STATUSES = [
  { value: 'draft', label: 'Draft', badge: 'bg-slate-100 text-slate-700 ring-slate-300' },
  { value: 'published', label: 'Published', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  { value: 'closed', label: 'Closed', badge: 'bg-rose-50 text-rose-800 ring-rose-300' },
];
export const JOB_STATUS_MAP = Object.fromEntries(JOB_STATUSES.map((s) => [s.value, s]));

export const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'temporary', label: 'Temporary' },
];
export const REMOTE_POLICIES = [
  { value: 'onsite', label: 'On-site' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'remote', label: 'Remote' },
];
export const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'hiring_manager', label: 'Hiring manager' },
];
export const RECOMMENDATIONS = [
  { value: 'strong_yes', label: 'Strong yes' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'strong_no', label: 'Strong no' },
];

const labelOf = (list) => (v) => list.find((x) => x.value === v)?.label ?? v;
export const employmentLabel = labelOf(EMPLOYMENT_TYPES);
export const remoteLabel = labelOf(REMOTE_POLICIES);
export const roleLabel = labelOf(ROLES);
export const recommendationLabel = labelOf(RECOMMENDATIONS);

export const canManage = (user) => user?.role === 'admin' || user?.role === 'recruiter';

export function formatDate(d, opts = { dateStyle: 'medium' }) {
  return d ? new Intl.DateTimeFormat(undefined, opts).format(new Date(d)) : '—';
}
export const formatDateTime = (d) => formatDate(d, { dateStyle: 'medium', timeStyle: 'short' });

export function relativeTime(d) {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  for (const [unit, secs] of units) if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  return 'just now';
}

export function formatSalary(job) {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const fmt = (n) => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: job.currency || 'USD', maximumFractionDigits: 0 }).format(n);
    } catch {
      return `${job.currency} ${n}`;
    }
  };
  if (job.salaryMin != null && job.salaryMax != null) return `${fmt(job.salaryMin)} – ${fmt(job.salaryMax)}`;
  return job.salaryMin != null ? `From ${fmt(job.salaryMin)}` : `Up to ${fmt(job.salaryMax)}`;
}

export const formatBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

/** Résumé formats accepted on the careers page (the server re-checks each file's contents). */
export const RESUME_FORMATS = [
  { ext: '.pdf', label: 'PDF' },
  { ext: '.docx', label: 'Word document' },
  { ext: '.doc', label: 'Word 97–2003 document' },
  { ext: '.odt', label: 'OpenDocument text' },
  { ext: '.rtf', label: 'Rich Text' },
  { ext: '.txt', label: 'Plain text' },
];
export const resumeFormatLabel = (fileName = '') =>
  RESUME_FORMATS.find((f) => fileName.toLowerCase().endsWith(f.ext))?.label ?? 'Document';

export const EDUCATION_LEVELS = [
  { value: 'high_school', label: 'High school' },
  { value: 'diploma', label: 'Diploma / Associate' },
  { value: 'bachelor', label: "Bachelor's degree" },
  { value: 'master', label: "Master's degree" },
  { value: 'phd', label: 'PhD / Doctorate' },
];
export const educationLabel = (v) => EDUCATION_LEVELS.find((l) => l.value === v)?.label ?? v;

/** Compact age for tight spaces: "today", "3d", "2w", "4mo", "1y". */
export function shortAgo(d) {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** How much a job lets the AI decide (server: utils/aiScreening.js). */
export const AI_SCREEN_MODES = [
  { value: 'off', label: 'Off — AI summaries only', short: 'Off', badge: 'bg-slate-100 text-slate-600 ring-slate-300', hint: 'The AI writes a summary and fit score. People make every decision.' },
  { value: 'review', label: 'Recommend — a recruiter confirms rejections', short: 'Recommend', badge: 'bg-violet-50 text-violet-800 ring-violet-300', hint: 'AI rejections wait in the AI screening queue until someone confirms or overturns them. Strong fits are shortlisted.' },
  { value: 'auto', label: 'Automatic — AI rejects and shortlists', short: 'Automatic', badge: 'bg-violet-600 text-white ring-violet-600', hint: 'The AI moves applicants to Rejected or Screening on its own. You can reinstate anyone from the AI screening page.' },
];
export const AI_SCREEN_MODE_MAP = Object.fromEntries(AI_SCREEN_MODES.map((m) => [m.value, m]));

export const AI_ACTIONS = {
  rejected: { label: 'AI rejected', badge: 'bg-rose-50 text-rose-800 ring-rose-300' },
  pending_reject: { label: 'AI: reject?', badge: 'bg-violet-50 text-violet-800 ring-violet-300' },
  advanced: { label: 'AI shortlisted', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  review: { label: 'AI: needs review', badge: 'bg-amber-50 text-amber-800 ring-amber-300' },
};
