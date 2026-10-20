'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useApi } from '@/lib/api';

export function CompanyLogo({ company, className = 'h-8 w-8' }) {
  if (company?.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={company.logoUrl} alt="" className={`${className} rounded-md object-contain`} />;
  }
  return (
    <span aria-hidden className={`${className} flex items-center justify-center rounded-md bg-slate-900 text-sm font-semibold text-white`}>
      {(company?.name || 'C')[0]}
    </span>
  );
}

export function useCompany() {
  return useApi('/public/company').data?.company;
}

export default function CareersHeader() {
  const company = useCompany();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav aria-label="Careers" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/careers" className="flex min-w-0 items-center gap-2.5">
          <CompanyLogo company={company} />
          <span className="truncate text-[15px] font-semibold text-slate-900">{company?.name ?? ' '}</span>
          <span className="hidden text-[15px] text-slate-400 sm:inline">Careers</span>
        </Link>
        <div className="flex items-center gap-1 text-sm sm:gap-2">
          <Link href="/careers#roles" className="rounded-md px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900">
            Open roles
          </Link>
          {company?.website && (
            <a
              href={company.website}
              rel="noopener noreferrer"
              className="hidden items-center gap-1 rounded-md px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 sm:inline-flex"
            >
              About us <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
          <Link href="/login" className="rounded-md px-2.5 py-1.5 text-slate-500 hover:text-slate-800">
            Team sign in
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function CareersFooter() {
  const company = useCompany();
  if (!company) return <footer className="border-t border-slate-200 bg-white py-10" />;
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1.4fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <CompanyLogo company={company} className="h-7 w-7" />
            <span className="font-semibold text-slate-900">{company.name}</span>
          </div>
          {company.description && <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-600">{company.description}</p>}
        </div>
        <div className="text-sm">
          <h2 className="font-semibold text-slate-900">Contact</h2>
          <ul className="mt-3 space-y-1.5 text-slate-600">
            {company.contactEmail && (
              <li>
                <a href={`mailto:${company.contactEmail}`} className="hover:text-slate-900 hover:underline">
                  {company.contactEmail}
                </a>
              </li>
            )}
            {company.phone && <li>{company.phone}</li>}
            {company.address && <li>{company.address}</li>}
          </ul>
        </div>
        <div className="text-sm">
          <h2 className="font-semibold text-slate-900">Equal opportunity</h2>
          <p className="mt-3 leading-relaxed text-slate-600">
            {company.name} is an equal opportunity employer. We welcome applicants of every background and consider everyone on the basis of their skills and experience.
            Your application is only shared with our hiring team.
          </p>
        </div>
      </div>
      <div className="border-t border-slate-100">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500 sm:px-6">
          © {new Date().getFullYear()} {company.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
