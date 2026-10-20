'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Alert, Button, TextInput } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address');
    setError('');
    setLoading(true);
    try {
      setResult(await api('/auth/forgot-password', { method: 'POST', body: { email } }));
    } catch (err) {
      setError(err.fields?.email || err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reset your password</h1>
      <p className="mb-6 mt-1 text-sm text-slate-600">Enter your work email and we&apos;ll generate a reset link.</p>
      {result ? (
        <div className="space-y-4">
          <Alert kind="success">{result.message}</Alert>
          {result.devResetUrl && (
            <Alert kind="info">
              <p className="font-medium">Development mode</p>
              <p className="mt-1">Email delivery is not part of this version. Use this link to continue:</p>
              <Link href={result.devResetUrl.replace(/^https?:\/\/[^/]+/, '')} className="mt-1 block break-all font-medium underline">
                Open reset link
              </Link>
            </Alert>
          )}
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <TextInput label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} required autoFocus />
          <Button type="submit" loading={loading} className="h-11 w-full">
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
