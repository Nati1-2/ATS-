import CareersHeader, { CareersFooter } from './CareersHeader';

export const metadata = { title: 'Careers' };

export default function CareersLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a href="#main" className="sr-only z-50 rounded bg-blue-600 px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Skip to content
      </a>
      <CareersHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <CareersFooter />
    </div>
  );
}
