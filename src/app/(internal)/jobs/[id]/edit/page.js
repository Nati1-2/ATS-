'use client';

import { useParams } from 'next/navigation';
import JobForm from '@/components/JobForm';
import { useAuth } from '@/components/AuthProvider';
import { useApi } from '@/lib/api';
import { canManage } from '@/lib/constants';
import { Card, ErrorState, JobStatusBadge, LoadingState, PageHeader } from '@/components/ui';

export default function EditJobPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi(`/jobs/${id}`);

  if (!canManage(user)) {
    return (
      <Card>
        <ErrorState error={{ status: 403, message: 'Only admins and recruiters can edit jobs.' }} />
      </Card>
    );
  }
  if (loading) return <LoadingState />;
  if (error)
    return (
      <Card>
        <ErrorState error={error} onRetry={reload} />
      </Card>
    );
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={<span className="flex items-center gap-3">Edit job <JobStatusBadge status={data.job.status} /></span>} description={data.job.title} />
      <JobForm job={data.job} />
    </div>
  );
}
