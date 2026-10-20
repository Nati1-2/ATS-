'use client';

import { useEffect, useState } from 'react';
import { Building2, Copy, ImagePlus, Trash2, UserPlus } from 'lucide-react';
import { api, useApi } from '@/lib/api';
import { formatDate, roleLabel, ROLES } from '@/lib/constants';
import { useAuth } from '@/components/AuthProvider';
import {
  Alert, Avatar, Badge, Button, Card, ConfirmDialog, ErrorState, inputClass, LoadingState, PageHeader, SelectInput, TextArea, TextInput, useToast,
} from '@/components/ui';

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

function CompanySettings({ isAdmin }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/settings/company');
  const [form, setForm] = useState(null);
  const [logo, setLogo] = useState({ file: null, preview: null, remove: false });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      const { name, description, website, contactEmail, phone, address, careersHeadline, careersIntro, benefits } = data.company;
      setForm({ name, description, website, contactEmail, phone, address, careersHeadline: careersHeadline ?? '', careersIntro: careersIntro ?? '', benefits: (benefits ?? []).join('\n') });
      setLogo({ file: null, preview: data.company.logoUrl, remove: false });
    }
  }, [data]);

  if (loading || !form) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function pickLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) return setErrors((x) => ({ ...x, logo: 'Use a PNG, JPG, WEBP, or SVG image' }));
    if (file.size > 2 * 1024 * 1024) return setErrors((x) => ({ ...x, logo: 'Logo must be 2 MB or smaller' }));
    setErrors((x) => ({ ...x, logo: undefined }));
    setLogo({ file, preview: URL.createObjectURL(file), remove: false });
  }

  async function save(e) {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Company name is required';
    if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) errs.contactEmail = 'Enter a valid email address';
    if (form.website && !/^https?:\/\/.+/.test(form.website)) errs.website = 'Enter a full URL, e.g. https://example.com';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v ?? ''));
      if (logo.file) fd.append('logo', logo.file);
      if (logo.remove) fd.append('removeLogo', 'true');
      await api('/settings/company', { method: 'PUT', form: fd });
      toast('Company settings saved');
      reload();
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-5 p-5 sm:p-6">
      {!isAdmin && <Alert kind="info">Only admins can change company settings.</Alert>}
      <fieldset disabled={!isAdmin} className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {logo.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo.preview} alt="Company logo" className="h-full w-full object-contain" />
            ) : (
              <Building2 className="h-7 w-7 text-slate-400" aria-hidden />
            )}
          </div>
          {isAdmin && (
            <div>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-500">
                  <ImagePlus className="h-4 w-4" aria-hidden /> Upload logo
                  <input type="file" accept={LOGO_TYPES.join(',')} onChange={pickLogo} className="sr-only" />
                </label>
                {logo.preview && (
                  <Button size="sm" variant="ghost" onClick={() => setLogo({ file: null, preview: null, remove: true })}>
                    Remove
                  </Button>
                )}
              </div>
              <p className={`mt-1 text-xs ${errors.logo ? 'font-medium text-rose-600' : 'text-slate-500'}`}>{errors.logo || 'PNG, JPG, WEBP or SVG, up to 2 MB'}</p>
            </div>
          )}
        </div>
        <TextInput label="Company name" required value={form.name} onChange={set('name')} error={errors.name} />
        <TextArea label="Description" rows={4} value={form.description} onChange={set('description')} error={errors.description} hint="Shown on your public careers page" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <TextInput label="Website" type="url" value={form.website} onChange={set('website')} error={errors.website} placeholder="https://" />
          <TextInput label="Contact email" type="email" value={form.contactEmail} onChange={set('contactEmail')} error={errors.contactEmail} />
          <TextInput label="Phone" type="tel" value={form.phone} onChange={set('phone')} error={errors.phone} />
          <TextInput label="Address" value={form.address} onChange={set('address')} error={errors.address} />
        </div>
        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Careers page</h3>
          <p className="mb-4 mt-1 text-xs text-slate-500">What applicants see on your public careers site. Leave a field empty to hide it.</p>
          <div className="space-y-5">
            <TextInput label="Headline" value={form.careersHeadline} onChange={set('careersHeadline')} error={errors.careersHeadline} maxLength={120} placeholder="e.g. Build the software that keeps deliveries moving" />
            <TextArea label="Introduction" rows={3} value={form.careersIntro} onChange={set('careersIntro')} error={errors.careersIntro} hint="A short paragraph about the team and the work" />
            <TextArea label="Benefits" rows={5} value={form.benefits} onChange={set('benefits')} error={errors.benefits} hint="One per line, up to 12" />
          </div>
        </div>
      </fieldset>
      {isAdmin && (
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
        </div>
      )}
    </form>
  );
}

function TeamSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi('/settings/team');
  const [invite, setInvite] = useState({ email: '', role: 'recruiter' });
  const [inviteErrors, setInviteErrors] = useState({});
  const [inviteUrl, setInviteUrl] = useState('');
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  async function sendInvite(e) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email.trim())) return setInviteErrors({ email: 'Enter a valid email address' });
    setInviteErrors({});
    setInviting(true);
    try {
      const res = await api('/settings/team/invites', { method: 'POST', body: invite });
      setInviteUrl(res.inviteUrl);
      setInvite({ email: '', role: invite.role });
      toast(`Invitation created for ${res.invite.email}`);
      reload();
    } catch (err) {
      setInviteErrors(err.fields || { email: err.message });
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(member, role) {
    try {
      await api(`/settings/team/${member.id}`, { method: 'PATCH', body: { role } });
      toast(`${member.name} is now ${roleLabel(role)}`);
      reload();
    } catch (err) {
      toast(err.message, 'error');
      reload();
    }
  }

  async function confirmRemove() {
    setBusy(true);
    try {
      if (removing.kind === 'invite') await api(`/settings/team/invites/${removing.item.id}`, { method: 'DELETE' });
      else await api(`/settings/team/${removing.item.id}`, { method: 'DELETE' });
      toast(removing.kind === 'invite' ? 'Invitation revoked' : `${removing.item.name} was removed`);
      setRemoving(null);
      reload();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={sendInvite} noValidate className="space-y-3 border-b border-slate-200 p-5 sm:p-6">
        <h3 className="text-sm font-semibold">Invite a team member</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-start">
          <TextInput label="Email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} error={inviteErrors.email} placeholder="name@company.com" />
          <SelectInput label="Role" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} options={ROLES} error={inviteErrors.role} />
          <Button type="submit" loading={inviting} className="sm:mt-[26px]">
            <UserPlus className="h-4 w-4" aria-hidden /> Invite
          </Button>
        </div>
        {inviteUrl && (
          <Alert kind="success">
            <p>Share this invitation link (valid for 7 days). Automated emails aren&apos;t part of this version.</p>
            <div className="mt-2 flex gap-2">
              <input readOnly value={inviteUrl} aria-label="Invitation link" className={inputClass()} onFocus={(e) => e.target.select()} />
              <Button
                size="md"
                variant="secondary"
                onClick={() => navigator.clipboard?.writeText(inviteUrl).then(() => toast('Link copied'), () => toast('Copy failed — select and copy manually', 'error'))}
              >
                <Copy className="h-4 w-4" aria-hidden /> Copy
              </Button>
            </div>
          </Alert>
        )}
      </form>

      <ul className="divide-y divide-slate-100">
        {data.users.map((m) => (
          <li key={m.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={m.name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {m.name} {m.id === user.id && <span className="text-slate-500">(you)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {m.email} · Joined {formatDate(m.createdAt)}
                </p>
              </div>
            </div>
            {m.id === user.id ? (
              <Badge className="bg-blue-50 text-blue-800 ring-blue-300">{roleLabel(m.role)}</Badge>
            ) : (
              <div className="flex items-center gap-2">
                <label htmlFor={`role-${m.id}`} className="sr-only">
                  Role for {m.name}
                </label>
                <select id={`role-${m.id}`} value={m.role} onChange={(e) => changeRole(m, e.target.value)} className={`${inputClass()} w-44`}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <Button variant="ghost" size="icon" onClick={() => setRemoving({ kind: 'user', item: m })} aria-label={`Remove ${m.name}`}>
                  <Trash2 className="h-4 w-4 text-rose-600" />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {data.invites.length > 0 && (
        <div className="border-t border-slate-200">
          <h3 className="px-5 pt-4 text-sm font-semibold sm:px-6">Pending invitations</h3>
          <ul className="divide-y divide-slate-100">
            {data.invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{i.email}</p>
                  <p className="text-xs text-slate-500">
                    {roleLabel(i.role)} · Expires {formatDate(i.expiresAt)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setRemoving({ kind: 'invite', item: i })}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        loading={busy}
        danger
        title={removing?.kind === 'invite' ? 'Revoke invitation?' : 'Remove team member?'}
        confirmLabel={removing?.kind === 'invite' ? 'Revoke' : 'Remove'}
        message={
          removing?.kind === 'invite'
            ? `The invitation link for ${removing?.item.email} will stop working.`
            : `${removing?.item.name} will immediately lose access. Their notes and feedback will be kept.`
        }
        onConfirm={confirmRemove}
      />
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Settings" description="Company profile and team access." />
      <Card>
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold">Company</h2>
        </div>
        <CompanySettings isAdmin={isAdmin} />
      </Card>
      {isAdmin && (
        <Card>
          <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold">Team members</h2>
            <p className="text-sm text-slate-500">Invite colleagues and manage their roles.</p>
          </div>
          <TeamSettings />
        </Card>
      )}
    </div>
  );
}
