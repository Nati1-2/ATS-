import PublicShell from '../careers/PublicShell';
import { ToastProvider } from '@/components/ui';

export default function SeekerLayout({ children }) {
  return (
    <PublicShell>
      <ToastProvider>{children}</ToastProvider>
    </PublicShell>
  );
}
