import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import multer from 'multer';
import { requireAuth, requireRole } from './middleware/auth.js';
import { HttpError } from './utils/http.js';
import { MAX_RESUME_MB } from './utils/uploads.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import jobRoutes from './routes/jobs.js';
import candidateRoutes from './routes/candidates.js';
import applicationRoutes, { interviewsRouter } from './routes/applications.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import aiRoutes from './routes/ai.js';
import aiScreeningRoutes from './routes/aiScreening.js';
import cvCheckerRoutes from './routes/cvChecker.js';
import seekerRoutes from './routes/seeker.js';
import paymentRoutes from './routes/payments.js';

/** Build the Express app. Kept separate from startup so tests can import it. */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
  if (process.env.NODE_ENV !== 'test') {
    // Skip health-check noise in production logs
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', { skip: (req) => req.path === '/api/health' }));
  }
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    const db = mongoose.connection.readyState === 1;
    res.status(db ? 200 : 503).json({ ok: db, db });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/seeker', seekerRoutes);
  app.use('/api/dashboard', requireAuth, dashboardRoutes);
  app.use('/api/jobs', requireAuth, jobRoutes);
  app.use('/api/candidates', requireAuth, candidateRoutes);
  app.use('/api/applications', requireAuth, applicationRoutes);
  app.use('/api/interviews', requireAuth, interviewsRouter);
  app.use('/api/settings', requireAuth, settingsRoutes);
  app.use('/api/ai', requireAuth, aiRoutes);
  app.use('/api/ai-screening', requireAuth, aiScreeningRoutes);
  app.use('/api/cv-checker', requireAuth, cvCheckerRoutes);
  app.use('/api/payments', requireAuth, requireRole('admin'), paymentRoutes);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const maxMb = err.field === 'logo' ? 2 : MAX_RESUME_MB;
      const message = err.code === 'LIMIT_FILE_SIZE' ? `File is too large (max ${maxMb} MB)` : err.message;
      return res.status(400).json({ error: message, fields: { [err.field || 'file']: message } });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err?.code === 11000) return res.status(409).json({ error: 'A record with these details already exists' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side' : err.message, fields: err.details });
  });
  return app;
}
