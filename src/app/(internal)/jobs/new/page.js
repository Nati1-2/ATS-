'use client';

import JobForm from '@/components/JobForm';
import { useAuth } from '@/components/AuthProvider';
import { canManage } from '@/lib/constants';
import { Card, ErrorState, PageHeader } from '@/components/ui';

export default function NewJobPage() {
  const { user } = useAuth();
  if (!canManage(user)) {
    return (
      <Card>
        <ErrorState error={{ status: 403, message: 'Only admins and recruiters can create jobs.' }} />
      </Card>
    );
  }
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Create job" description="Save as a draft to keep working on it, or publish to start accepting applications." />
      <JobForm />
    </div>
  );
}
