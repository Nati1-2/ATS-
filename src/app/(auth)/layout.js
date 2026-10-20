import Link from 'next/link';
import AuthBrand from './AuthBrand';
import AuthShowcase from './AuthShowcase';

export default function AuthLayout({ children }) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-h-screen flex-col px-6 py-6 sm:px-10">
        <AuthBrand />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-xs text-slate-500 lg:text-left">
          Looking for a job?{' '}
          <Link href="/careers" className="font-medium text-slate-700 underline-offset-2 hover:underline">
            See our open roles
          </Link>
        </p>
      </div>
      <AuthShowcase />
    </main>
  );
}
