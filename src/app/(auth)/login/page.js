'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Alert, Button, PasswordInput, TextInput } from '@/components/ui';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEMO = process.env.NODE_ENV !== 'production';
const DEMO_ACCOUNTS = [
  ['Admin', 'admin@acme.test'],
  ['Recruiter', 'recruiter@acme.test'],
  ['Hiring manager', 'manager@acme.test'],
];

function LoginForm() {
  const params = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const expired = params.get('next') && !formError;

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((x) => (x[k] ? { ...x, [k]: undefined } : x));
  };

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!EMAIL_RX.test(form.email.trim())) errs.email = 'Enter a valid email address';
    if (!form.password) errs.password = 'Password is required';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await api('/auth/login', { method: 'POST', body: form });
      const next = params.get('next');
      // Only allow same-site relative redirects
      window.location.assign(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError ? (
          <Alert>{formError}</Alert>
        ) : (
          expired && <Alert kind="info">Please sign in to continue.</Alert>
        )}
        <TextInput label="Work email" id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="you@company.com" autoFocus />
        <PasswordInput
          id="password"
          autoComplete="current-password"
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          labelAction={
            <Link href="/forgot-password" className="text-sm font-medium text-blue-700 hover:underline">
              Forgot password?
            </Link>
          }
        />
        <Button type="submit" loading={loading} className="h-11 w-full">
          Sign in
        </Button>
      </form>

      {/* Demo logins are a development convenience only — never shown in a production build */}
      {DEMO && (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-4">
          <p className="text-xs font-semibold text-slate-700">Demo accounts</p>
          <p className="mt-0.5 text-xs text-slate-500">Development only. The password for all of them is Password123!</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map(([role, email]) => (
              <button
                key={email}
                type="button"
                onClick={() => setForm({ email, password: 'Password123!' })}
                className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              >
                Use {role}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
      <p className="mb-8 mt-1.5 text-sm text-slate-600">Sign in to your hiring workspace.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
