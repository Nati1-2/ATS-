'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Check, ChevronRight, Search } from 'lucide-react';
import { qs, useApi, useQueryUpdater } from '@/lib/api';
import { employmentLabel, formatSalary, relativeTime, remoteLabel } from '@/lib/constants';
import { cx, ErrorState, inputClass, LoadingState, Spinner } from '@/components/ui';

function Facts({ data }) {
  const f = data?.facets;
  const remote = f?.remotePolicies?.some((p) => p === 'remote' || p === 'hybrid');
  const rows = [
    ['Open roles', data?.total ?? '—'],
    ['Teams hiring', f?.departments.length ?? '—'],
    ['Locations', f?.locations.length ?? '—'],
    ['Remote work', f ? (remote ? 'Remote & hybrid roles' : 'On-site') : '—'],
  ];
  return (
    <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 px-5 py-3.5">
          <dt className="text-sm text-slate-500">{k}</dt>
          <dd className="text-right text-sm font-semibold text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function JobRow({ job }) {
  const salary = formatSalary(job);
  return (
    <li>
      <Link href={`/careers/${job._id}`} className="group flex items-center gap-4 py-4 sm:px-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-base font-medium text-slate-900 group-hover:text-blue-700 group-hover:underline">{job.title}</h4>
          <p className="mt-0.5 text-sm text-slate-500">
            {job.location} <span aria-hidden>·</span> {remoteLabel(job.remotePolicy)}
            <span className="sm:hidden">
              {' '}
              <span aria-hidden>·</span> {employmentLabel(job.employmentType)}
            </span>
          </p>
        </div>
        <div className="hidden shrink-0 text-right text-sm sm:block">
          <p className="text-slate-700">{employmentLabel(job.employmentType)}</p>
          {salary && <p className="text-slate-500">{salary}</p>}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden />
      </Link>
    </li>
  );
}

function JobBoard() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = {
    department: params.get('department') || '',
    location: params.get('location') || '',
    employmentType: params.get('employmentType') || '',
  };
  const [q, setQ] = useState(params.get('q') || '');
  const [debouncedQ, setDebouncedQ] = useState(q);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const company = useApi('/public/company').data?.company;
  const all = useApi('/public/jobs'); // unfiltered: facts and filter options
  const { data, error, loading, reload } = useApi(`/public/jobs${qs({ q: debouncedQ, ...filters })}`);
  const setQuery = useQueryUpdater();
  const setFilter = (k, v) => setQuery({ q: debouncedQ, [k]: v });
  const hasFilters = Boolean(debouncedQ || filters.department || filters.location || filters.employmentType);

  const groups = {};
  for (const j of data?.jobs ?? []) (groups[j.department] ??= []).push(j);
  const departments = Object.keys(groups).sort();
  const facets = all.data?.facets;
  const latest = all.data?.jobs?.[0]?.publishedAt;

  return (
    <>
      {/* Intro */}
      <section className="border-b border-slate-200 bg-slate-50/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_20rem] lg:items-center lg:py-20">
          <div>
            <p className="text-sm font-medium text-blue-700">Careers at {company?.name ?? '…'}</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl">
              {company ? company.careersHeadline || `Work at ${company.name}` : ' '}
            </h1>
            {(company?.careersIntro || company?.description) && (
              <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">{company.careersIntro || company.description}</p>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="#roles" className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800">
                See open roles <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              {latest && <span className="text-sm text-slate-500">Last role posted {relativeTime(latest)}</span>}
            </div>
          </div>
          <Facts data={all.data} />
        </div>
      </section>

      {/* Benefits */}
      {company?.benefits?.length > 0 && (
        <section aria-labelledby="benefits-title" className="border-b border-slate-200">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="benefits-title" className="text-2xl font-semibold tracking-tight text-slate-900">
              What you can expect
            </h2>
            <ul className="mt-8 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {company.benefits.map((b) => (
                <li key={b} className="flex gap-3 text-[15px] leading-relaxed text-slate-700">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Roles */}
      <section id="roles" aria-labelledby="roles-title" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 id="roles-title" className="text-2xl font-semibold tracking-tight text-slate-900">
              Open roles
            </h2>
            <p className="text-sm text-slate-500" aria-live="polite">
              {loading && data ? (
                <Spinner className="inline h-4 w-4" />
              ) : data ? (
                `${data.jobs.length} ${data.jobs.length === 1 ? 'role' : 'roles'}${hasFilters ? ' match your search' : ''}`
              ) : null}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_12rem_10rem]">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <label htmlFor="careers-search" className="sr-only">
                Search jobs
              </label>
              <input id="careers-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title or keyword" className={cx(inputClass(), 'h-10 pl-9')} />
            </div>
            {[
              ['department', 'All teams', 'Filter by department', facets?.departments.map((d) => ({ value: d, label: d }))],
              ['location', 'All locations', 'Filter by location', facets?.locations.map((d) => ({ value: d, label: d }))],
              ['employmentType', 'All types', 'Filter by employment type', facets?.employmentTypes.map((d) => ({ value: d, label: employmentLabel(d) }))],
            ].map(([key, all, label, opts]) => (
              <div key={key}>
                <label htmlFor={`f-${key}`} className="sr-only">
                  {label}
                </label>
                <select id={`f-${key}`} value={filters[key]} onChange={(e) => setFilter(key, e.target.value)} className={cx(inputClass(), 'h-10')}>
                  <option value="">{all}</option>
                  {(opts || []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className={cx('mt-8', loading && data && 'opacity-60 transition-opacity')}>
            {loading && !data ? (
              <LoadingState label="Loading open roles…" />
            ) : error ? (
              <ErrorState error={error} onRetry={reload} />
            ) : data.jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center">
                <p className="font-medium text-slate-900">{hasFilters ? 'No roles match your search' : 'No open roles right now'}</p>
                <p className="mt-1 text-sm text-slate-500">{hasFilters ? 'Try a different keyword or clear the filters.' : 'New roles are posted regularly, so please check back soon.'}</p>
                {hasFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setQ('');
                      setDebouncedQ('');
                      router.replace(pathname, { scroll: false });
                    }}
                    className="mt-4 text-sm font-medium text-blue-700 hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-10">
                {departments.map((dept) => (
                  <div key={dept} className="grid gap-2 md:grid-cols-[14rem_1fr] md:gap-8">
                    <h3 className="pt-4 text-sm font-semibold text-slate-900">
                      {dept} <span className="font-normal text-slate-400">{groups[dept].length}</span>
                    </h3>
                    <ul className="divide-y divide-slate-200 border-y border-slate-200">
                      {groups[dept].map((job) => (
                        <JobRow key={job._id} job={job} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

export default function CareersPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <JobBoard />
    </Suspense>
  );
}
