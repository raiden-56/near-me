import { BadgePercent, Check, Eye, EyeOff, MapPin, Megaphone, SearchX, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, Notice } from '@/components/common/states';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/sheet';
import { formatDateRange } from '@/lib/time';
import { useSettings } from '@/store/settings';
import type { Deal, DealKind, ModerationState } from '@/types';
import { ApprovalSetting } from '../components/ApprovalSetting';
import { AdminPage, DataTable, FilterSelect, ModerationBadge, QueryState, RowMenu, SearchField, Toolbar, type Column, type RowAction } from '../components/kit';
import { useDealMutations, useDeals, useLatest, useTick } from '../hooks';

const KIND_LABEL: Record<DealKind, string> = {
  discount: 'Discount',
  offer: 'Offer',
  happy_hour: 'Happy hour',
  seasonal: 'Seasonal',
  event: 'Event',
  limited: 'Limited time',
};

type Filter = 'all' | ModerationState;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Any state' },
  { value: 'pending', label: 'Waiting for approval' },
  { value: 'visible', label: 'Visible' },
  { value: 'hidden', label: 'Hidden' },
];

function runState(deal: Deal, now: number): { label: string; tone: BadgeTone } {
  if (now < deal.startsAt) return { label: 'Scheduled', tone: 'butter' };
  if (now >= deal.endsAt) return { label: 'Ended', tone: 'neutral' };
  return { label: 'Running', tone: 'sage' };
}

function DealsTable({ deals }: { deals: Deal[] }) {
  useTick(60_000);
  const now = Date.now();
  const sampleOn = useSettings((s) => s.sampleData);
  const { setModeration, setPromoted, remove } = useDealMutations();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [deleting, setDeleting] = useState<Deal | null>(null);
  const deleted = useLatest(deleting);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return deals.filter((d) => (filter === 'all' || d.moderation === filter) && (!needle || [d.title, d.description, d.placeName, d.badge, d.code ?? ''].some((v) => v.toLowerCase().includes(needle))));
  }, [deals, q, filter]);
  const filtered = q.trim() !== '' || filter !== 'all';

  const actionsFor = (d: Deal): (RowAction | false)[] => [
    { label: 'View place', icon: MapPin, to: `/place/${d.placeId}` },
    d.moderation === 'pending' && { label: 'Approve', icon: Check, separated: true, onSelect: () => setModeration.mutate({ id: d.id, state: 'visible', approve: true }) },
    d.moderation === 'hidden'
      ? { label: 'Restore deal', icon: Eye, separated: true, onSelect: () => setModeration.mutate({ id: d.id, state: 'visible' }) }
      : { label: 'Hide deal', icon: EyeOff, separated: d.moderation !== 'pending', onSelect: () => setModeration.mutate({ id: d.id, state: 'hidden' }) },
    { label: d.promoted ? 'Remove promotion' : 'Promote', icon: Megaphone, onSelect: () => setPromoted.mutate({ id: d.id, promoted: !d.promoted }) },
    { label: 'Delete', icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(d) },
  ];

  const summary = (d: Deal) => (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{d.badge}</Badge>
        <span className="text-[12.5px] text-muted-2">{KIND_LABEL[d.kind]}</span>
        {d.code && <span className="rounded border border-dashed border-line-2 px-1.5 font-mono text-[11.5px] text-ink-2">{d.code}</span>}
      </p>
      <p className="mt-1 truncate font-semibold text-ink">{d.title}</p>
      <p className="line-clamp-1 text-[12.5px] text-muted-2">{d.description}</p>
    </div>
  );

  const promoteSwitch = (d: Deal) => (
    <Switch checked={d.promoted} disabled={setPromoted.isPending} onCheckedChange={(on) => setPromoted.mutate({ id: d.id, promoted: on })} aria-label={`Promote ${d.title}`} />
  );

  const approveButton = (d: Deal) =>
    d.moderation === 'pending' ? (
      <Button size="sm" loading={setModeration.isPending && setModeration.variables?.id === d.id} onClick={() => setModeration.mutate({ id: d.id, state: 'visible', approve: true })}>
        <Check /> Approve
      </Button>
    ) : null;

  const columns: Column<Deal>[] = [
    { id: 'deal', header: 'Deal', cell: (d) => <div className="max-w-[320px]">{summary(d)}</div> },
    {
      id: 'place',
      header: 'Business',
      cell: (d) => (
        <Link to={`/place/${d.placeId}`} className="block max-w-[180px] truncate font-medium text-ink hover:underline">
          {d.placeName}
        </Link>
      ),
    },
    {
      id: 'runs',
      header: 'Runs',
      cell: (d) => {
        const run = runState(d, now);
        return (
          <div className="whitespace-nowrap">
            <Badge tone={run.tone}>{run.label}</Badge>
            <p className="tabular mt-1 text-[12.5px] text-muted-2">{formatDateRange(d.startsAt, d.endsAt)}</p>
          </div>
        );
      },
    },
    { id: 'promoted', header: 'Promoted', cell: promoteSwitch },
    { id: 'state', header: 'State', cell: (d) => <ModerationBadge state={d.moderation} /> },
    {
      id: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      cell: (d) => (
        <div className="flex items-center justify-end gap-1.5">
          {approveButton(d)}
          <RowMenu label={`Actions for ${d.title}`} actions={actionsFor(d)} />
        </div>
      ),
    },
  ];

  return (
    <>
      {sampleOn && (
        <Notice tone="sample" className="mb-4">
          Only deals created by businesses are listed. The sample deals shown in the app are generated on the fly and are not stored.
        </Notice>
      )}

      <Toolbar>
        <SearchField value={q} onChange={setQ} placeholder="Search deal, business or code" label="Search deals" />
        <FilterSelect label="State" value={filter} onChange={setFilter} options={FILTERS} />
      </Toolbar>

      <DataTable
        caption="Deals, waiting for approval first"
        noun={['deal', 'deals']}
        rows={rows}
        columns={columns}
        rowKey={(d) => d.id}
        card={(d) => {
          const run = runState(d, now);
          return (
            <div>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">{summary(d)}</div>
                <RowMenu label={`Actions for ${d.title}`} actions={actionsFor(d)} />
              </div>
              <p className="mt-2 text-[12.5px] text-muted-2">
                <Link to={`/place/${d.placeId}`} className="font-medium text-ink-2 hover:underline">
                  {d.placeName}
                </Link>{' '}
                · <span className="tabular">{formatDateRange(d.startsAt, d.endsAt)}</span>
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
                <ModerationBadge state={d.moderation} />
                <Badge tone={run.tone}>{run.label}</Badge>
                <label className="ml-auto flex items-center gap-2 text-[13px] text-ink-2">
                  Promoted {promoteSwitch(d)}
                </label>
              </div>
              {d.moderation === 'pending' && <div className="mt-3">{approveButton(d)}</div>}
            </div>
          );
        }}
        empty={
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="No deals match"
              description="Try a different search or state."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={BadgePercent} title="No deals yet" description="Deals that businesses publish from the business portal are listed here." />
          )
        }
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this deal?"
        description={`“${deleted?.title ?? ''}” from ${deleted?.placeName ?? 'this business'} is removed for good, including from people's saved deals. To take it down but keep it, hide it instead.`}
        confirmLabel="Delete deal"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}

export default function DealsPage() {
  const deals = useDeals();
  return (
    <AdminPage title="Deals" subtitle="Offers published by businesses: approve them, promote them or take them down.">
      <ApprovalSetting
        field="dealsRequireApproval"
        title="Deals need approval"
        description="When on, a new deal waits here until an administrator approves it. When off, deals go live as soon as a business publishes them."
        noun="deals"
      />
      <QueryState query={deals}>{(data) => <DealsTable deals={data} />}</QueryState>
    </AdminPage>
  );
}
