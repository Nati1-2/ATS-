import CareersHeader, { CareersFooter } from './CareersHeader';
import { SeekerProvider } from '@/components/SeekerProvider';

/** Public site shell: the careers pages and the job seeker area (CV check, dashboard, upgrade). */
export default function PublicShell({ children }) {
  return (
    <SeekerProvider>
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
    </SeekerProvider>
  );
}
