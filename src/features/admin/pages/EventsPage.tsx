import { CalendarDays, Check, Eye, EyeOff, MapPin, SearchX, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState, Notice } from '@/components/common/states';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/sheet';
import { formatDateRange } from '@/lib/time';
import { titleCase } from '@/lib/utils';
import { useSettings } from '@/store/settings';
import type { EventItem, ModerationState } from '@/types';
import { ApprovalSetting } from '../components/ApprovalSetting';
import { AdminPage, DataTable, FilterSelect, ModerationBadge, QueryState, RowMenu, SearchField, Toolbar, type Column, type RowAction } from '../components/kit';
import { useEventMutations, useEvents, useLatest, useTick } from '../hooks';

type Filter = 'all' | ModerationState;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Any state' },
  { value: 'pending', label: 'Waiting for approval' },
  { value: 'visible', label: 'Visible' },
  { value: 'hidden', label: 'Hidden' },
];

const SOURCE_LABEL: Record<EventItem['source'], string> = { community: 'Community', business: 'Business', sample: 'Sample' };

function when(event: EventItem, now: number): { label: string; tone: BadgeTone } {
  if (now < event.startsAt) return { label: 'Upcoming', tone: 'butter' };
  if (now >= event.endsAt) return { label: 'Ended', tone: 'neutral' };
  return { label: 'Happening now', tone: 'sage' };
}

function EventsTable({ events }: { events: EventItem[] }) {
  useTick(60_000);
  const now = Date.now();
  const sampleOn = useSettings((s) => s.sampleData);
  const { setModeration, remove } = useEventMutations();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [deleting, setDeleting] = useState<EventItem | null>(null);
  const deleted = useLatest(deleting);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((e) => (filter === 'all' || e.moderation === filter) && (!needle || [e.title, e.description, e.venueName, e.organizer].some((v) => v.toLowerCase().includes(needle))));
  }, [events, q, filter]);
  const filtered = q.trim() !== '' || filter !== 'all';

  const actionsFor = (e: EventItem): (RowAction | false)[] => [
    Boolean(e.placeId) && { label: 'View venue', icon: MapPin, to: `/place/${e.placeId}` },
    e.moderation === 'pending' && { label: 'Approve', icon: Check, onSelect: () => setModeration.mutate({ id: e.id, state: 'visible', approve: true }) },
    e.moderation === 'hidden'
      ? { label: 'Restore event', icon: Eye, onSelect: () => setModeration.mutate({ id: e.id, state: 'visible' }) }
      : { label: e.moderation === 'pending' ? 'Decline and hide' : 'Hide event', icon: EyeOff, onSelect: () => setModeration.mutate({ id: e.id, state: 'hidden' }) },
    { label: 'Delete', icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(e) },
  ];

  const summary = (e: EventItem) => (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-1.5">
        <Badge tone="outline">{titleCase(e.kind)}</Badge>
        <span className="text-[12.5px] text-muted-2">{e.price || 'Free'}</span>
      </p>
      <p className="mt-1 truncate font-semibold text-ink">{e.title}</p>
      <p className="line-clamp-2 text-[12.5px] text-muted-2">{e.description}</p>
    </div>
  );

  const approveButton = (e: EventItem) =>
    e.moderation === 'pending' ? (
      <Button size="sm" loading={setModeration.isPending && setModeration.variables?.id === e.id} onClick={() => setModeration.mutate({ id: e.id, state: 'visible', approve: true })}>
        <Check /> Approve
      </Button>
    ) : null;

  const columns: Column<EventItem>[] = [
    { id: 'event', header: 'Event', cell: (e) => <div className="max-w-[340px]">{summary(e)}</div> },
    {
      id: 'venue',
      header: 'Venue and organiser',
      cell: (e) => (
        <div className="max-w-[190px]">
          <p className="truncate text-ink">{e.venueName}</p>
          <p className="truncate text-[12.5px] text-muted-2">
            {e.organizer} · {SOURCE_LABEL[e.source]}
          </p>
        </div>
      ),
    },
    {
      id: 'when',
      header: 'When',
      cell: (e) => {
        const w = when(e, now);
        return (
          <div className="whitespace-nowrap">
            <Badge tone={w.tone}>{w.label}</Badge>
            <p className="tabular mt-1 text-[12.5px] text-muted-2">{formatDateRange(e.startsAt, e.endsAt)}</p>
          </div>
        );
      },
    },
    {
      id: 'interest',
      header: 'Interested',
      cell: (e) => (
        <span className="tabular inline-flex items-center gap-1.5 text-[13px] text-ink-2">
          <Users className="size-3.5 text-muted-2" aria-hidden /> {e.interested.length}
        </span>
      ),
    },
    { id: 'state', header: 'State', cell: (e) => <ModerationBadge state={e.moderation} /> },
    {
      id: 'actions',
      header: 'Actions',
      srOnlyHeader: true,
      align: 'right',
      cell: (e) => (
        <div className="flex items-center justify-end gap-1.5">
          {approveButton(e)}
          <RowMenu label={`Actions for ${e.title}`} actions={actionsFor(e)} />
        </div>
      ),
    },
  ];

  return (
    <>
      {sampleOn && (
        <Notice tone="sample" className="mb-4">
          Only events submitted by people and businesses are listed. The sample events shown in the app are generated on the fly and are not stored.
        </Notice>
      )}

      <Toolbar>
        <SearchField value={q} onChange={setQ} placeholder="Search event, venue or organiser" label="Search events" />
        <FilterSelect label="State" value={filter} onChange={setFilter} options={FILTERS} />
      </Toolbar>

      <DataTable
        caption="Events, waiting for approval first"
        noun={['event', 'events']}
        rows={rows}
        columns={columns}
        rowKey={(e) => e.id}
        card={(e) => {
          const w = when(e, now);
          return (
            <div>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">{summary(e)}</div>
                <RowMenu label={`Actions for ${e.title}`} actions={actionsFor(e)} />
              </div>
              <p className="mt-2 text-[12.5px] text-muted-2">
                {e.venueName} · {e.organizer} · <span className="tabular">{formatDateRange(e.startsAt, e.endsAt)}</span>
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <ModerationBadge state={e.moderation} />
                <Badge tone={w.tone}>{w.label}</Badge>
                <span className="tabular text-[12.5px] text-muted-2">{e.interested.length} interested</span>
              </div>
              {e.moderation === 'pending' && <div className="mt-3">{approveButton(e)}</div>}
            </div>
          );
        }}
        empty={
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="No events match"
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
            <EmptyState icon={CalendarDays} title="No events yet" description="Events that people and businesses submit are listed here, with anything waiting for approval at the top." />
          )
        }
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this event?"
        description={`“${deleted?.title ?? ''}” is removed for good, along with the points its submitter earned. To take it down but keep it, hide it instead.`}
        confirmLabel="Delete event"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}

export default function EventsPage() {
  const events = useEvents();
  return (
    <AdminPage title="Events" subtitle="Local events sent in by the community and by businesses. Approving one credits whoever submitted it.">
      <ApprovalSetting
        field="eventsRequireApproval"
        title="Events need approval"
        description="When on, a submitted event waits here until an administrator approves it. When off, events are listed as soon as they are submitted."
        noun="events"
      />
      <QueryState query={events}>{(data) => <EventsTable events={data} />}</QueryState>
    </AdminPage>
  );
}
