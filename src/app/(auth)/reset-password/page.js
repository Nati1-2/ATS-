'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Alert, Button, PasswordInput } from '@/components/ui';

function ResetForm() {
  const token = useSearchParams().get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) return <Alert>This reset link is missing its token. Request a new one.</Alert>;
  if (done)
    return (
      <div className="space-y-4">
        <Alert kind="success">Your password has been updated.</Alert>
        <Link href="/login" className="block text-center text-sm font-medium text-blue-600 hover:underline">
          Sign in
        </Link>
      </div>
    );

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (form.password.length < 8) errs.password = 'Password must be at least 8 characters';
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password: form.password } });
      setDone(true);
    } catch (err) {
      setFormError(err.message);
      setErrors(err.fields || {});
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError && <Alert>{formError}</Alert>}
      <PasswordInput label="New password" autoComplete="new-password" hint="At least 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} required />
      <PasswordInput label="Confirm password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} error={errors.confirm} required />
      <Button type="submit" loading={loading} className="h-11 w-full">
        Update password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-slate-900">Choose a new password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </>
  );
}
