import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, History, Hourglass, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { Page, PageHeader } from '@/components/common/layout-bits';
import { EmptyState } from '@/components/common/states';
import { Chip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { CONTRIBUTION_LABEL } from '@/lib/community';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';
import { contributionsService } from '@/services/contributions';
import { useAuth } from '@/store/auth';
import type { Contribution } from '@/types';

const STATUS: Record<Contribution['status'], { label: string; icon: typeof CircleCheck; className: string }> = {
  verified: { label: 'Verified', icon: CircleCheck, className: 'text-success' },
  pending: { label: 'Awaiting verification', icon: Hourglass, className: 'text-warning' },
  rejected: { label: 'Not accepted', icon: CircleX, className: 'text-danger' },
};

type Filter = 'all' | Contribution['status'];

export default function ContributionsPage() {
  const user = useAuth((s) => s.user);
  const ready = useAuth((s) => s.ready);
  const version = useLocalDb((s) => s.contributions);
  const [filter, setFilter] = useState<Filter>('all');
  const list = useQuery({ queryKey: ['contributions', 'list', user?.id, version], queryFn: () => contributionsService.list(user!.id), enabled: Boolean(user), staleTime: 0 });
  const summary = useQuery({ queryKey: ['contributions', 'summary', user?.id, version], queryFn: () => contributionsService.summary(user!.id), enabled: Boolean(user), staleTime: 0 });

  const items = useMemo(() => (list.data ?? []).filter((c) => filter === 'all' || c.status === filter), [list.data, filter]);

  if (ready && !user) return <Navigate to="/login?next=/profile/contributions" replace />;
  const s = summary.data;

  return (
    <Page className="max-w-[820px]">
      <PageHeader
        back="/profile"
        title="Your contributions"
        subtitle="Everything you have added to NearMe, and whether it has been verified."
        actions={
          <Button asChild>
            <Link to="/contribute">
              <Plus /> <span className="hidden sm:inline">Contribute</span>
            </Link>
          </Button>
        }
      />

      {s && (
        <dl className="mb-6 grid grid-cols-3 gap-3">
          {[
            { label: 'Verified points', value: s.points },
            { label: 'Pending points', value: s.pendingPoints },
            { label: 'Reputation', value: `${s.reputation}/100` },
          ].map((x) => (
            <div key={x.label} className="card p-4">
              <dd className="display tabular text-[26px] leading-none text-ink">{x.value}</dd>
              <dt className="mt-1.5 text-[12.5px] text-muted-2">{x.label}</dt>
            </div>
          ))}
        </dl>
      )}

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        {(['all', 'verified', 'pending', 'rejected'] as Filter[]).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : STATUS[f].label}
            <span className="tabular opacity-70">{f === 'all' ? (list.data?.length ?? 0) : (list.data?.filter((c) => c.status === f).length ?? 0)}</span>
          </Chip>
        ))}
      </div>

      {list.isPending ? (
        <div className="space-y-2.5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={History}
          title={filter === 'all' ? 'No contributions yet' : 'Nothing in this state'}
          description="Review a place you know, confirm a live update, or add a place that is missing from the map."
          action={
            <Button asChild>
              <Link to="/contribute">Make your first contribution</Link>
            </Button>
          }
        />
      ) : (
        <ol className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {items.map((c) => {
            const st = STATUS[c.status];
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium text-muted-2">
                    {CONTRIBUTION_LABEL[c.kind]} · {timeAgo(c.createdAt)}
                  </span>
                  <span className="mt-0.5 block truncate text-[15px] font-medium text-ink">{c.title}</span>
                  <span className={cn('mt-1 flex items-center gap-1.5 text-[12.5px] font-medium', st.className)}>
                    <st.icon className="size-3.5" aria-hidden /> {st.label}
                  </span>
                </span>
                <span className={cn('tabular shrink-0 text-right text-[15px] font-semibold', c.status === 'verified' ? 'text-success' : 'text-muted')}>
                  {c.status === 'rejected' ? '0' : `+${c.points}`}
                  <span className="block text-[11.5px] font-normal text-muted-2">points</span>
                </span>
              </>
            );
            return (
              <li key={c.id}>
                {c.placeId ? (
                  <Link to={`/place/${c.placeId}`} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-4 px-4 py-3.5">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <p className="mt-6 text-[13px] leading-relaxed text-muted-2">
        Points count once a contribution is verified: a live update when someone else confirms it, a new place or edit when a moderator approves it. Repeating the same update does not earn more points, and rejected contributions lower your reputation.
      </p>
    </Page>
  );
}
