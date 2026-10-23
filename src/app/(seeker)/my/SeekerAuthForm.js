'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Alert, Button, Card, LoadingState, PasswordInput, TextInput } from '@/components/ui';

function Form({ mode }) {
  const params = useSearchParams();
  const checked = params.get('checked') === '1';
  const signup = mode === 'signup';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const other = `${signup ? '/my/login' : '/my/signup'}${checked ? '?checked=1' : ''}`;

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setLoading(true);
    try {
      await api(`/seeker/${mode}`, { method: 'POST', body: signup ? form : { email: form.email, password: form.password } });
      // Full reload so the header and dashboard pick up the new session
      window.location.assign('/my');
    } catch (err) {
      setErrors(err.fields || {});
      setFormError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-16">
      {checked && (
        <div className="mb-6 flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Your CV has been checked. {signup ? 'Create a free account' : 'Sign in'} to see your score.</span>
        </div>
      )}
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{signup ? 'Create your account' : 'Sign in'}</h1>
      <p className="mt-1 text-sm text-slate-600">{signup ? 'See your CV score and track your job applications in one place.' : 'Welcome back. See your CV results and applications.'}</p>
      <Card className="mt-6 p-5 sm:p-6">
        <form onSubmit={submit} noValidate className="space-y-4">
          {formError && <Alert>{formError}</Alert>}
          {signup && <TextInput id="name" label="Full name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} autoFocus />}
          <TextInput id="email" label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} autoFocus={!signup} />
          <PasswordInput id="password" autoComplete={signup ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} error={errors.password} hint={signup ? 'At least 8 characters' : undefined} />
          <Button type="submit" loading={loading} className="h-11 w-full">
            {signup ? 'Create account' : 'Sign in'}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-slate-600">
        {signup ? 'Already have an account?' : 'New here?'}{' '}
        <Link href={other} className="font-medium text-blue-700 hover:underline">
          {signup ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}

export default function SeekerAuthForm({ mode }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <Form mode={mode} />
    </Suspense>
  );
}
