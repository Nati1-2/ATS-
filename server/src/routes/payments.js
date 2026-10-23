import { Router } from 'express';
import { z } from 'zod';
import { Payment, Seeker, PAYMENT_STATUSES } from '../models/index.js';
import { HttpError, validate, assertObjectId } from '../utils/http.js';

/** Admins confirm job seekers' Payoneer payments; approving one unlocks that seeker's full CV reports. */
const router = Router();

router.get('/', async (req, res) => {
  const status = PAYMENT_STATUSES.includes(req.query.status) ? req.query.status : undefined;
  const [payments, pending] = await Promise.all([
    Payment.find(status ? { status } : {}).populate('seeker', 'name email premiumAt').populate('reviewedBy', 'name').sort({ createdAt: -1 }).limit(200).lean(),
    Payment.countDocuments({ status: 'pending' }),
  ]);
  res.json({ payments, pending });
});

async function pendingPayment(id) {
  assertObjectId(id, 'Payment');
  const payment = await Payment.findById(id);
  if (!payment) throw new HttpError(404, 'Payment not found');
  if (payment.status !== 'pending') throw new HttpError(409, `This payment was already ${payment.status}`);
  return payment;
}

router.post('/:id/approve', async (req, res) => {
  const payment = await pendingPayment(req.params.id);
  Object.assign(payment, { status: 'approved', reviewedBy: req.user._id, reviewedAt: new Date() });
  await payment.save();
  await Seeker.updateOne({ _id: payment.seeker, premiumAt: null }, { $set: { premiumAt: new Date() } });
  res.json({ payment });
});

router.post('/:id/reject', async (req, res) => {
  const body = validate(z.object({ reason: z.string().trim().max(500).optional().default('') }), req.body ?? {});
  const payment = await pendingPayment(req.params.id);
  Object.assign(payment, { status: 'rejected', reviewedBy: req.user._id, reviewedAt: new Date(), rejectReason: body.reason || undefined });
  await payment.save();
  res.json({ payment });
});

export default router;
