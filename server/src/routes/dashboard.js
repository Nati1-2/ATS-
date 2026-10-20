import { Router } from 'express';
import { Job, Application, Interview, STAGES } from '../models/index.js';
import { accessibleJobIds } from '../middleware/auth.js';

const router = Router();

router.get('/', async (req, res) => {
  const ids = await accessibleJobIds(req.user);
  const jobScope = ids ? { _id: { $in: ids } } : {};
  const appScope = ids ? { job: { $in: ids } } : {};

  const [openJobs, totalApplications, upcomingInterviews, hired, stageAgg, recentApplications, nextInterviews] =
    await Promise.all([
      Job.countDocuments({ ...jobScope, status: 'published' }),
      Application.countDocuments(appScope),
      Interview.countDocuments({ ...appScope, status: 'scheduled', scheduledAt: { $gte: new Date() } }),
      Application.countDocuments({ ...appScope, stage: 'hired' }),
      Application.aggregate([{ $match: appScope }, { $group: { _id: '$stage', count: { $sum: 1 } } }]),
      Application.find(appScope)
        .populate('candidate', 'fullName email')
        .populate('job', 'title')
        .select('stage createdAt candidate job match.score autoDecision')
        .sort({ createdAt: -1 })
        .limit(8),
      Interview.find({ ...appScope, status: 'scheduled', scheduledAt: { $gte: new Date() } })
        .populate('candidate', 'fullName')
        .populate('job', 'title')
        .populate('interviewer', 'name')
        .sort({ scheduledAt: 1 })
        .limit(5),
    ]);

  const counts = Object.fromEntries(stageAgg.map((s) => [s._id, s.count]));
  const decisionAgg = await Application.aggregate([
    { $match: { ...appScope, autoDecision: { $exists: true } } },
    { $group: { _id: '$autoDecision', count: { $sum: 1 } } },
  ]);
  const decisions = Object.fromEntries(decisionAgg.map((d) => [d._id, d.count]));
  res.json({
    stats: { openJobs, totalApplications, upcomingInterviews, hired },
    screening: { rejected: decisions.rejected ?? 0, advanced: decisions.advanced ?? 0, review: decisions.review ?? 0 },
    stageSummary: STAGES.map((stage) => ({ stage, count: counts[stage] ?? 0 })),
    recentApplications,
    nextInterviews,
  });
});

export default router;
