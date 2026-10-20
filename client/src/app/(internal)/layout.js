import { AuthProvider } from '@/components/AuthProvider';
import AppShell from '@/components/AppShell';
import { ToastProvider } from '@/components/ui';

export default function InternalLayout({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </AuthProvider>
  );
}
