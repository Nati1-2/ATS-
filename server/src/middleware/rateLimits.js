import rateLimit from 'express-rate-limit';

/**
 * Rate limits with friendly JSON errors. Limits are per IP address and configurable,
 * because whole offices (or a careers fair) often share one public IP.
 */
const num = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const limiter = ({ windowMinutes, limit, message, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res, _next, options) => res.status(options.statusCode).json({ error: message }),
  });

// Brute-force protection: only FAILED sign-ins count, so a busy team on one IP is never locked out
export const loginLimiter = limiter({
  windowMinutes: 15,
  limit: num('LOGIN_FAILURES_PER_15_MIN', 20),
  skipSuccessfulRequests: true,
  message: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.',
});

// Job seeker sign-ins count separately, so failures there never lock staff out of the same IP
export const seekerLoginLimiter = limiter({
  windowMinutes: 15,
  limit: num('LOGIN_FAILURES_PER_15_MIN', 20),
  skipSuccessfulRequests: true,
  message: 'Too many failed sign-in attempts. Please wait 15 minutes and try again.',
});

// Password reset and invitation links
export const accountLimiter = limiter({
  windowMinutes: 15,
  limit: num('ACCOUNT_REQUESTS_PER_15_MIN', 30),
  message: 'Too many requests. Please wait a few minutes and try again.',
});

// Job applications from one IP
export const applyLimiter = limiter({
  windowMinutes: 60,
  limit: num('APPLICATIONS_PER_HOUR', 60),
  message: 'Too many applications from your network in the last hour. Please try again later.',
});

// Job seekers checking their own CV, per IP (each one is an AI request, and works signed out)
export const seekerCheckLimiter = limiter({
  windowMinutes: 60,
  limit: num('SEEKER_CV_CHECKS_PER_HOUR', 10),
  message: 'You have checked a lot of CVs this hour. Please try again a little later.',
});

// AI assistant messages per signed-in user (each one can use several AI requests)
export const aiChatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: num('AI_CHAT_MESSAGES_PER_HOUR', 60),
  keyGenerator: (req) => `user:${req.user._id}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'You have sent a lot of questions this hour. Please try again a little later.' }),
});

// Questions about a CV report per job seeker
export const seekerChatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: num('SEEKER_CHAT_MESSAGES_PER_HOUR', 30),
  keyGenerator: (req) => `seeker:${req.seeker._id}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'You have asked a lot of questions this hour. Please try again a little later.' }),
});

// AI reports per signed-in user
export const aiReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: num('AI_REPORTS_PER_HOUR', 20),
  keyGenerator: (req) => `user:${req.user._id}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many reports this hour. Please try again later.' }),
});

// CV checker reviews per signed-in user (one AI request each)
export const aiCvCheckLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: num('AI_CV_CHECKS_PER_HOUR', 30),
  keyGenerator: (req) => `user:${req.user._id}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'You have checked a lot of CVs this hour. Please try again a little later.' }),
});
