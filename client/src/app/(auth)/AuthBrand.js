'use client';

import Link from 'next/link';
import { useApi } from '@/lib/api';

/** Company name and logo from Settings, shown above the sign-in forms. */
export default function AuthBrand() {
  const company = useApi('/public/company').data?.company;
  return (
    <Link href="/careers" className="flex w-fit items-center gap-2.5">
      {company?.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={company.logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
      ) : (
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
          {(company?.name || 'A')[0]}
        </span>
      )}
      <span className="text-[15px] font-semibold text-slate-900">{company ? `${company.name} Hiring` : ' '}</span>
    </Link>
  );
}
