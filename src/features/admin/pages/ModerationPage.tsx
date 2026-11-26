import { ArrowUpRight, Ban, CircleCheck, EyeOff, History, MapPinPlus, ShieldCheck, Undo2, UserX } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState } from '@/components/common/states';
import { Badge, SampleTag, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/controls';
import { timeAgo } from '@/lib/time';
import type { ModerationAction, ModerationRow, TargetState } from '@/services/admin';
import { useAuth } from '@/store/auth';
import type { ModerationTarget, PlaceSuggestion } from '@/types';
import { SuggestionList } from '../components/SuggestionList';
import { AdminPage, DataTable, NoteDialog, Panel, QueryState, type Column } from '../components/kit';
import { useLatest, useModerationMutations, useModerationQueue, useSuggestions } from '../hooks';

type Tab = 'open' | 'suggestions' | 'resolved';
const isTab = (v: string | null): v is Tab => v === 'open' || v === 'suggestions' || v === 'resolved';

const TARGET_LABEL: Record<ModerationTarget, string> = {
  review: 'Review',
  report: 'Live update',
  deal: 'Deal',
  event: 'Event',
  business: 'Business',
  user: 'Account',
  place: 'Place',
};

const STATE_META: Record<TargetState, { label: string; tone: BadgeTone }> = {
  visible: { label: 'Currently visible', tone: 'success' },
  pending: { label: 'Held back', tone: 'warning' },
  hidden: { label: 'Hidden', tone: 'danger' },
  missing: { label: 'No longer exists', tone: 'neutral' },
  external: { label: 'OpenStreetMap data', tone: 'outline' },
};

/** Listings and accounts are not "hidden": say what their state actually is. */
function stateLabel(item: ModerationRow): string {
  if (item.targetType === 'business' && !item.isSampleTarget) return item.targetState === 'hidden' ? 'Rejected or suspended' : item.targetState === 'visible' ? 'Listed' : STATE_META[item.targetState].label;
  if (item.targetType === 'user' && !item.isSampleTarget) return item.targetState === 'hidden' ? 'Suspended' : item.targetState === 'visible' ? 'Active' : STATE_META[item.targetState].label;
  return STATE_META[item.targetState].label;
}

const ACTION_META: Record<ModerationAction, { label: string; icon: typeof EyeOff; title: string; description: string; note: string }> = {
  hide: {
    label: 'Hide content',
    icon: EyeOff,
    title: 'Hide this content?',
    description: 'It disappears from the app for everyone and every open flag on it is closed. You can restore it later from the history.',
    note: 'Hidden: it breaks the community guidelines.',
  },
  suspend_listing: {
    label: 'Suspend listing',
    icon: Ban,
    title: 'Suspend this listing?',
    description: 'The listing loses its verified status and the owner sees your note in the business portal.',
    note: 'Suspended after reports from the community.',
  },
  suspend_user: {
    label: 'Suspend account',
    icon: UserX,
    title: 'Suspend this account?',
    description: 'The person cannot sign in until an administrator reactivates the account on the Users screen.',
    note: 'Suspended after reports from the community.',
  },
  none: {
    label: 'Mark resolved',
    icon: CircleCheck,
    title: 'Mark this flag as resolved?',
    description: 'The flag is closed and nothing else changes. Use this when the problem is already dealt with: the content is gone or hidden, or the place was corrected on OpenStreetMap.',
    note: 'Already dealt with.',
  },
};

function ItemCell({ item }: { item: ModerationRow }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="outline">{TARGET_LABEL[item.targetType]}</Badge>
        <Badge tone={STATE_META[item.targetState].tone}>{stateLabel(item)}</Badge>
        {item.isSampleTarget && <SampleTag />}
      </div>
      <p className="mt-1.5 font-semibold text-ink">{item.targetLabel}</p>
      {item.excerpt && <p className="mt-1 line-clamp-3 border-l-2 border-line-2 pl-2.5 text-[13px] leading-relaxed text-ink-2">{item.excerpt}</p>}
      {item.href && (
        <Link to={item.href} className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-ink hover:underline">
          See it in context <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function ReasonCell({ item }: { item: ModerationRow }) {
  return (
    <div className="min-w-0">
      <p className="text-ink">{item.reason}</p>
      {item.note && <p className="mt-0.5 text-[13px] text-ink-2">“{item.note}”</p>}
      <p className="tabular mt-1 text-[12.5px] text-muted-2">
        {item.reporterName} · {timeAgo(item.createdAt)}
      </p>
    </div>
  );
}

function OpenQueue({ items }: { items: ModerationRow[] }) {
  const me = useAuth((s) => s.user);
  const { resolve } = useModerationMutations();
  const [deciding, setDeciding] = useState<{ item: ModerationRow; decision: 'act' | 'dismiss' } | null>(null);
  const decided = useLatest(deciding);
  const actMeta = decided ? ACTION_META[decided.item.action] : ACTION_META.none;
  const dismissRestores = decided?.item.targetType === 'report' && decided.item.targetState === 'pending';

  const buttons = (item: ModerationRow) => {
    const meta = ACTION_META[item.action];
    const self = item.action === 'suspend_user' && item.targetId === me?.id;
    return (
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Button size="sm" variant={item.action === 'none' ? 'secondary' : 'primary'} disabled={self} title={self ? 'You cannot suspend your own account' : undefined} onClick={() => setDeciding({ item, decision: 'act' })}>
          <meta.icon /> {meta.label}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setDeciding({ item, decision: 'dismiss' })}>
          Dismiss
        </Button>
      </div>
    );
  };

  const columns: Column<ModerationRow>[] = [
    { id: 'item', header: 'Flagged item', cell: (item) => <div className="max-w-[380px]">{<ItemCell item={item} />}</div>, className: 'align-top' },
    { id: 'reason', header: 'Reason and reporter', cell: (item) => <div className="max-w-[280px]">{<ReasonCell item={item} />}</div>, className: 'align-top' },
    { id: 'actions', header: 'Decision', srOnlyHeader: true, align: 'right', cell: buttons, className: 'align-top' },
  ];

  return (
    <>
      <DataTable
        caption="Open moderation items"
        noun={['open item', 'open items']}
        rows={items}
        columns={columns}
        rowKey={(item) => item.id}
        card={(item) => (
          <div className="space-y-3">
            <ItemCell item={item} />
            <div className="rounded-xl bg-surface-2 p-3 text-sm">
              <ReasonCell item={item} />
            </div>
            {buttons(item)}
          </div>
        )}
        empty={<EmptyState icon={ShieldCheck} title="The queue is clear" description="Content that people flag, and live updates held back after disputes, wait here for a decision." />}
      />

      <NoteDialog
        open={deciding !== null}
        onOpenChange={(open) => !open && setDeciding(null)}
        title={decided?.decision === 'dismiss' ? 'Dismiss this flag?' : actMeta.title}
        description={
          decided?.decision === 'dismiss'
            ? dismissRestores
              ? 'The flag is closed with no action, and the update that was held back becomes visible again.'
              : 'The flag is closed with no action. The content stays as it is.'
            : actMeta.description
        }
        label="Resolution note"
        initialValue={decided?.decision === 'dismiss' ? 'No action needed: the content is within the guidelines.' : actMeta.note}
        minLength={3}
        confirmLabel={decided?.decision === 'dismiss' ? 'Dismiss flag' : actMeta.label}
        destructive={decided?.decision === 'act' && decided.item.action !== 'none'}
        loading={resolve.isPending}
        onConfirm={(note) => deciding && resolve.mutate({ id: deciding.item.id, decision: deciding.decision, note }, { onSuccess: () => setDeciding(null) })}
      />
    </>
  );
}

function ResolvedHistory({ items }: { items: ModerationRow[] }) {
  const { restore } = useModerationMutations();
  const canRestore = (item: ModerationRow) => item.status === 'resolved' && item.action === 'hide' && item.targetState === 'hidden';

  const decision = (item: ModerationRow) => (
    <div className="min-w-0">
      <Badge tone={item.status === 'resolved' ? 'forest' : 'neutral'}>{item.status === 'resolved' ? 'Action taken' : 'Dismissed'}</Badge>
      {item.resolution && <p className="mt-1 text-[13px] text-ink-2">{item.resolution}</p>}
      <p className="tabular mt-0.5 text-[12.5px] text-muted-2">{timeAgo(item.resolvedAt ?? item.createdAt)}</p>
    </div>
  );

  const restoreButton = (item: ModerationRow) =>
    canRestore(item) ? (
      <Button size="sm" variant="secondary" loading={restore.isPending && restore.variables === item.id} onClick={() => restore.mutate(item.id)}>
        <Undo2 /> Restore content
      </Button>
    ) : null;

  const columns: Column<ModerationRow>[] = [
    { id: 'item', header: 'Flagged item', cell: (item) => <div className="max-w-[340px]">{<ItemCell item={item} />}</div>, className: 'align-top' },
    { id: 'reason', header: 'Reason and reporter', cell: (item) => <div className="max-w-[240px]">{<ReasonCell item={item} />}</div>, className: 'align-top' },
    { id: 'decision', header: 'Decision', cell: (item) => <div className="max-w-[260px]">{decision(item)}</div>, className: 'align-top' },
    { id: 'actions', header: 'Actions', srOnlyHeader: true, align: 'right', cell: restoreButton, className: 'align-top' },
  ];

  return (
    <DataTable
      caption="Resolved moderation items"
      noun={['decided item', 'decided items']}
      rows={items}
      columns={columns}
      rowKey={(item) => item.id}
      card={(item) => (
        <div className="space-y-3">
          <ItemCell item={item} />
          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            <ReasonCell item={item} />
          </div>
          {decision(item)}
          {restoreButton(item)}
        </div>
      )}
      empty={<EmptyState icon={History} title="No decisions yet" description="Flags you act on or dismiss are kept here with their resolution notes." />}
    />
  );
}

function Suggestions({ suggestions }: { suggestions: PlaceSuggestion[] }) {
  const pending = suggestions.filter((s) => s.status === 'pending');
  const decided = suggestions.filter((s) => s.status !== 'pending');
  return (
    <div className="space-y-4">
      {pending.length ? (
        <Panel title="Waiting for review" subtitle="New places, edits, closures and missing places sent in by the community" bodyClassName="px-5 pb-4 pt-3">
          <SuggestionList suggestions={pending} />
          <p className="mt-3 border-t border-line pt-3 text-[12.5px] text-muted-2">
            Approving marks the contribution as verified, which awards its points. Rejecting marks it rejected and lowers the contributor&rsquo;s reputation.
          </p>
        </Panel>
      ) : (
        <div className="card">
          <EmptyState icon={MapPinPlus} title="No suggestions waiting" description="When people add a missing place, suggest an edit or report a closure, it is listed here for approval." />
        </div>
      )}
      {decided.length > 0 && (
        <Panel title="Decided" subtitle={`${decided.length} earlier ${decided.length === 1 ? 'suggestion' : 'suggestions'}`} bodyClassName="px-5 pb-4 pt-3">
          <SuggestionList suggestions={decided.slice(0, 20)} />
        </Panel>
      )}
    </div>
  );
}

export default function ModerationPage() {
  const queue = useModerationQueue();
  const suggestions = useSuggestions('place');
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = isTab(requested) ? requested : 'open';

  const open = queue.data?.filter((m) => m.status === 'open');
  const resolved = queue.data?.filter((m) => m.status !== 'open');
  const pendingSuggestions = suggestions.data?.filter((s) => s.status === 'pending').length;

  return (
    <AdminPage title="Moderation" subtitle="Decide what happens to flagged content and to the places people suggest.">
      <Tabs
        value={tab}
        onChange={(next) => setParams(next === 'open' ? {} : { tab: next }, { replace: true })}
        className="mb-5"
        tabs={[
          { value: 'open', label: 'Open flags', count: open?.length },
          { value: 'suggestions', label: 'Place suggestions', count: pendingSuggestions },
          { value: 'resolved', label: 'History', count: resolved?.length },
        ]}
      />
      {tab === 'suggestions' ? (
        <QueryState query={suggestions}>{(data) => <Suggestions suggestions={data} />}</QueryState>
      ) : (
        <QueryState query={queue}>{(data) => (tab === 'open' ? <OpenQueue items={data.filter((m) => m.status === 'open')} /> : <ResolvedHistory items={data.filter((m) => m.status !== 'open')} />)}</QueryState>
      )}
    </AdminPage>
  );
}
