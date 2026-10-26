import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

export const ROLES = ['admin', 'recruiter', 'hiring_manager'];
export const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
export const JOB_STATUSES = ['draft', 'published', 'closed'];
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'temporary'];
export const REMOTE_POLICIES = ['onsite', 'hybrid', 'remote'];
export const AI_SCREEN_MODES = ['off', 'review', 'auto'];
// Standard disposition reasons, as in commercial ATSs, so rejections can be reported on
export const REJECTION_REASONS = ['knockout', 'missing_skills', 'experience', 'education', 'low_match', 'low_ai_fit', 'other'];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    active: { type: Boolean, default: true },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

const inviteSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ROLES, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    invitedBy: { type: ObjectId, ref: 'User' },
    acceptedAt: Date,
  },
  { timestamps: true }
);

const companySchema = new Schema(
  {
    name: { type: String, default: 'Our Company' },
    description: { type: String, default: '' },
    website: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    // Careers site content
    careersHeadline: { type: String, default: '' },
    careersIntro: { type: String, default: '' },
    benefits: [{ type: String, trim: true }],
    logo: { filename: String, mimetype: String },
  },
  { timestamps: true }
);

const jobSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    remotePolicy: { type: String, enum: REMOTE_POLICIES, required: true },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true },
    description: { type: String, required: true },
    responsibilities: { type: String, default: '' },
    requirements: { type: String, default: '' },
    salaryMin: Number,
    salaryMax: Number,
    currency: { type: String, default: 'USD' },
    status: { type: String, enum: JOB_STATUSES, default: 'draft', index: true },
    hiringManagers: [{ type: ObjectId, ref: 'User' }],
    // CV screening
    mustHaveSkills: [{ type: String, trim: true }],
    niceToHaveSkills: [{ type: String, trim: true }],
    screeningQuestions: [
      {
        question: { type: String, required: true, trim: true },
        type: { type: String, enum: ['yes_no', 'number', 'text'], required: true },
        required: { type: Boolean, default: true },
        knockout: { type: Boolean, default: false },
        expectedAnswer: { type: String, enum: ['yes', 'no'] },
        minValue: Number,
      },
    ],
    autoRejectKnockouts: { type: Boolean, default: false },
    // Automatic decisions made from the CV when someone applies
    minYearsExperience: { type: Number, min: 0, max: 50 },
    minEducation: { type: String, enum: ['high_school', 'diploma', 'bachelor', 'master', 'phd'] },
    autoScreen: {
      rejectBelowScore: { type: Number, min: 0, max: 100 },
      rejectMissingMustHave: { type: Boolean, default: false },
      rejectBelowMinYears: { type: Boolean, default: false },
      rejectMissingEducation: { type: Boolean, default: false },
      advanceAtScore: { type: Number, min: 0, max: 100 },
    },
    // AI screening (utils/aiScreening.js): decisions made from the AI analysis once it finishes.
    // mode 'review' = AI recommends rejections and a recruiter confirms; 'auto' = AI rejects on its own.
    aiScreen: {
      mode: { type: String, enum: AI_SCREEN_MODES, default: 'off' },
      rejectBelowFit: { type: Number, min: 0, max: 100 },
      rejectMissingMustHave: { type: Boolean, default: false },
      advanceAtFit: { type: Number, min: 0, max: 100 },
    },
    publishedAt: Date,
    closedAt: Date,
    createdBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
jobSchema.index({ title: 'text', department: 'text', location: 'text' });

const candidateSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
  },
  { timestamps: true }
);

const fileSchema = new Schema(
  { filename: String, originalName: String, mimetype: String, size: Number },
  { _id: false }
);

const applicationSchema = new Schema(
  {
    candidate: { type: ObjectId, ref: 'Candidate', required: true, index: true },
    job: { type: ObjectId, ref: 'Job', required: true, index: true },
    stage: { type: String, enum: STAGES, default: 'applied', index: true },
    resume: fileSchema,
    coverLetter: { type: String, default: '' },
    resumeText: { type: String, default: '', select: false },
    resumeTextExtracted: { type: Boolean, default: false },
    // Full scoring report from utils/scoring.js (score, components, skills evidence, years, education, flags)
    match: { type: Schema.Types.Mixed },
    screeningAnswers: [
      {
        _id: false,
        questionId: ObjectId,
        question: String,
        type: { type: String },
        answer: String,
        passed: Boolean,
        knockout: Boolean,
      },
    ],
    screeningPassed: { type: Boolean, default: true, index: true },
    autoRejected: { type: Boolean, default: false },
    // 'rejected' | 'advanced' | 'review' — what the screening rules decided at apply time
    autoDecision: { type: String, enum: ['rejected', 'advanced', 'review'], index: true },
    autoDecisionReasons: [String],
    // AI analysis (utils/ai.js): status pending|processing|done|failed|disabled, summary, strengths, concerns, fit…
    ai: { type: Schema.Types.Mixed },
    resumeTextSource: { type: String, enum: ['file', 'ai'], default: 'file' },
    // AI screening decision (utils/aiScreening.js):
    // { action: 'rejected'|'pending_reject'|'advanced'|'review', reasons, reasonCode, fitScore, mode, decidedAt,
    //   review?: { outcome: 'confirmed'|'overturned', by, byName, at } }
    aiScreen: { type: Schema.Types.Mixed },
    // Who last set the stage: the rules at apply time, the AI, or a person
    stageSetBy: { type: String, enum: ['rules', 'ai', 'human'], default: 'rules' },
    stageChangedAt: { type: Date, default: Date.now },
    // Job seeker account that applied while signed in (routes/seeker.js), so it shows on their dashboard
    seeker: { type: ObjectId, ref: 'Seeker', index: true },
  },
  { timestamps: true }
);
applicationSchema.index({ candidate: 1, job: 1 }, { unique: true });
applicationSchema.index({ job: 1, 'match.score': -1 });
applicationSchema.index({ 'aiScreen.action': 1, stage: 1 });

const noteSchema = new Schema(
  {
    application: { type: ObjectId, ref: 'Application', required: true, index: true },
    candidate: { type: ObjectId, ref: 'Candidate', required: true, index: true },
    author: { type: ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['note', 'feedback'], required: true },
    body: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5 },
    recommendation: { type: String, enum: ['strong_yes', 'yes', 'no', 'strong_no'] },
  },
  { timestamps: true }
);

const interviewSchema = new Schema(
  {
    application: { type: ObjectId, ref: 'Application', required: true, index: true },
    candidate: { type: ObjectId, ref: 'Candidate', required: true, index: true },
    job: { type: ObjectId, ref: 'Job', required: true, index: true },
    interviewer: { type: ObjectId, ref: 'User', required: true },
    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 60 },
    location: { type: String, default: '' },
    status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
    createdBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const activitySchema = new Schema(
  {
    candidate: { type: ObjectId, ref: 'Candidate', index: true },
    application: { type: ObjectId, ref: 'Application', index: true },
    job: { type: ObjectId, ref: 'Job' },
    actor: { type: ObjectId, ref: 'User' },
    type: {
      type: String,
      enum: ['applied', 'stage_changed', 'note_added', 'feedback_added', 'interview_scheduled', 'interview_updated', 'auto_rejected', 'auto_advanced', 'rescored', 'ai_analyzed', 'ai_rejected', 'ai_advanced', 'ai_flagged', 'ai_reviewed'],
      required: true,
    },
    message: { type: String, required: true },
    meta: Schema.Types.Mixed,
  },
  { timestamps: true }
);

const reportSchema = new Schema(
  {
    job: { type: ObjectId, ref: 'Job', index: true }, // empty = all jobs the creator could see
    title: { type: String, required: true },
    stats: { type: Schema.Types.Mixed, required: true }, // numbers from utils/insights.js at the time
    narrative: { type: Schema.Types.Mixed }, // AI-written text (may be missing if AI was off or failed)
    aiStatus: { type: String, enum: ['done', 'failed', 'disabled'], required: true },
    aiError: String,
    model: String,
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// CV checker results (utils/cvChecker.js). The CV text is kept (hidden by default) only so the
// person who ran the check can have it rewritten (utils/cvFixer.js); it is deleted with the check.
const cvCheckSchema = new Schema(
  {
    createdBy: { type: ObjectId, ref: 'User', required: true, index: true },
    source: { type: String, enum: ['upload', 'paste', 'application'], required: true },
    fileName: String,
    candidateName: String,
    application: { type: ObjectId, ref: 'Application' },
    job: { type: ObjectId, ref: 'Job' },
    jobTitle: String,
    targetRole: String,
    quick: { type: Schema.Types.Mixed, required: true }, // rule-based checks
    review: { type: Schema.Types.Mixed }, // AI review (missing when AI is off or failed)
    aiStatus: { type: String, enum: ['pending', 'done', 'failed', 'disabled'], required: true },
    aiError: String,
    model: String,
    cvText: { type: String, select: false },
    // AI rewrite fixing the weaknesses the person chose
    fix: {
      status: { type: String, enum: ['pending', 'done', 'failed'] },
      items: [String],
      skills: [String],
      notes: String,
      result: { type: Schema.Types.Mixed }, // { improvedCv, changes, stillMissing }
      error: String,
      model: String,
      startedAt: Date,
    },
  },
  { timestamps: true }
);

// Job seekers checking their own CV (routes/seeker.js). Separate from staff users so a seeker
// session can never reach the hiring API.
const seekerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    // Set when an admin approves a payment: unlocks the full CV reports
    premiumAt: Date,
  },
  { timestamps: true }
);

// A job seeker's CV check. Made before sign-up, then claimed with the token kept in a cookie.
const seekerCheckSchema = new Schema(
  {
    seeker: { type: ObjectId, ref: 'Seeker', index: true },
    claimTokenHash: { type: String, index: true, select: false },
    fileName: String,
    targetRole: String,
    quick: { type: Schema.Types.Mixed, required: true },
    review: { type: Schema.Types.Mixed },
    // 'pending' while the AI review runs in the background after the upload returns
    aiStatus: { type: String, enum: ['pending', 'done', 'failed', 'disabled'], required: true },
    aiError: String,
    model: String,
    cvText: { type: String, select: false },
    // AI rewrite fixing the weaknesses the person chose
    fix: {
      status: { type: String, enum: ['pending', 'done', 'failed'] },
      items: [String],
      skills: [String],
      notes: String,
      result: { type: Schema.Types.Mixed }, // { improvedCv, changes, stillMissing }
      error: String,
      model: String,
      startedAt: Date,
    },
  },
  { timestamps: true }
);

export const PAYMENT_STATUSES = ['pending', 'approved', 'rejected'];

// Manual Payoneer payment for the CV upgrade; an admin checks it arrived and approves it
const paymentSchema = new Schema(
  {
    seeker: { type: ObjectId, ref: 'Seeker', required: true, index: true },
    payerName: { type: String, required: true, trim: true },
    payerEmail: { type: String, required: true, lowercase: true, trim: true },
    reference: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    note: { type: String, default: '' },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'pending', index: true },
    reviewedBy: { type: ObjectId, ref: 'User' },
    reviewedAt: Date,
    rejectReason: String,
  },
  { timestamps: true }
);

export const User = model('User', userSchema);
export const Invite = model('Invite', inviteSchema);
export const Company = model('Company', companySchema);
export const Job = model('Job', jobSchema);
export const Candidate = model('Candidate', candidateSchema);
export const Application = model('Application', applicationSchema);
export const Note = model('Note', noteSchema);
export const Interview = model('Interview', interviewSchema);
export const Activity = model('Activity', activitySchema);
export const Report = model('Report', reportSchema);
export const CvCheck = model('CvCheck', cvCheckSchema);
export const Seeker = model('Seeker', seekerSchema);
export const SeekerCheck = model('SeekerCheck', seekerCheckSchema);
export const Payment = model('Payment', paymentSchema);

export async function getCompany() {
  let company = await Company.findOne();
  if (!company) company = await Company.create({});
  return company;
}
