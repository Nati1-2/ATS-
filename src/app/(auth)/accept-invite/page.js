'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, useApi } from '@/lib/api';
import { roleLabel } from '@/lib/constants';
import { Alert, Button, PasswordInput, LoadingState, TextInput } from '@/components/ui';

function AcceptForm() {
  const token = useSearchParams().get('token') || '';
  const invite = useApi(token ? `/auth/invite/${encodeURIComponent(token)}` : null);
  const [form, setForm] = useState({ name: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!token) return <Alert>This invitation link is incomplete.</Alert>;
  if (invite.loading) return <LoadingState />;
  if (invite.error) return <Alert>{invite.error.message}</Alert>;

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Enter your full name';
    if (form.password.length < 8) errs.password = 'Password must be at least 8 characters';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await api('/auth/accept-invite', { method: 'POST', body: { token, ...form } });
      window.location.assign('/dashboard');
    } catch (err) {
      setFormError(err.message);
      setErrors(err.fields || {});
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Alert kind="info">
        You&apos;ve been invited as <strong>{roleLabel(invite.data.role)}</strong> with <strong>{invite.data.email}</strong>.
      </Alert>
      {formError && <Alert>{formError}</Alert>}
      <TextInput label="Full name" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} required />
      <PasswordInput label="Password" autoComplete="new-password" hint="At least 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={errors.password} required />
      <Button type="submit" loading={loading} className="h-11 w-full">
        Create account
      </Button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight text-slate-900">Join your hiring team</h1>
      <Suspense>
        <AcceptForm />
      </Suspense>
    </>
  );
}
