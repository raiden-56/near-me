import { Check, Eye, EyeOff, Flag, MapPin, Radio, SearchX, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { EmptyState, Notice } from '@/components/common/states';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/sheet';
import { REPORT_TYPE_BY_ID, REPORT_TYPES } from '@/lib/community';
import { timeAgo, timeLeft } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useSettings } from '@/store/settings';
import type { CommunityReport, Freshness, ModerationState, ReportType, ReportView, Verification } from '@/types';
import { PolicyForm } from '../components/PolicyForm';
import { AdminPage, DataTable, FilterSelect, ModerationBadge, QueryState, RowMenu, SearchField, Toolbar, type Column, type RowAction } from '../components/kit';
import { useConfig, useLatest, useReportMutations, useReports } from '../hooks';

const LEVEL_TILE: Record<CommunityReport['level'], string> = {
  good: 'bg-success-soft text-success',
  moderate: 'bg-warning-soft text-warning',
  bad: 'bg-danger-soft text-danger',
  info: 'bg-bg-2 text-ink-2',
};

const FRESHNESS: Record<Freshness, { label: string; tone: BadgeTone }> = {
  live: { label: 'Live', tone: 'success' },
  recent: { label: 'Recent', tone: 'butter' },
  expired: { label: 'Expired', tone: 'neutral' },
};

const VERIFICATION: Record<Verification, { label: string; tone: BadgeTone }> = {
  business_confirmed: { label: 'Business confirmed', tone: 'success' },
  community_verified: { label: 'Community verified', tone: 'sage' },
  unverified: { label: 'Unverified', tone: 'outline' },
  disputed: { label: 'Disputed', tone: 'warning' },
};

type Any<T extends string> = 'all' | T;
const withAll = <T extends string>(label: string, options: { value: T; label: string }[]): { value: Any<T>; label: string }[] => [{ value: 'all', label }, ...options];

const TYPE_OPTIONS = withAll<ReportType>('Any type', REPORT_TYPES.map((t) => ({ value: t.type, label: t.label })));
const FRESHNESS_OPTIONS = withAll<Freshness>('Any freshness', (Object.keys(FRESHNESS) as Freshness[]).map((f) => ({ value: f, label: FRESHNESS[f].label })));
const VERIFICATION_OPTIONS = withAll<Verification>('Any verification', (Object.keys(VERIFICATION) as Verification[]).map((v) => ({ value: v, label: VERIFICATION[v].label })));
const MODERATION_OPTIONS = withAll<ModerationState>('Any moderation state', [
  { value: 'visible', label: 'Visible' },
  { value: 'pending', label: 'Pending' },
  { value: 'hidden', label: 'Hidden' },
]);

function Votes({ report }: { report: ReportView }) {
  return (
    <span className="tabular inline-flex items-center gap-2.5 whitespace-nowrap text-[13px] text-ink-2">
      <span className="inline-flex items-center gap-1" title="Confirmations">
        <Check className="size-3.5 text-success" aria-hidden />
        {report.confirmations.length}
        <span className="sr-only"> confirmations</span>
      </span>
      <span className="inline-flex items-center gap-1" title="Disagreements">
        <X className="size-3.5 text-danger" aria-hidden />
        {report.disagreements.length}
        <span className="sr-only"> disagreements</span>
      </span>
      {report.flagged.length > 0 && (
        <span className="inline-flex items-center gap-1 text-warning" title="Flags">
          <Flag className="size-3.5" aria-hidden />
          {report.flagged.length}
          <span className="sr-only"> flags</span>
        </span>
      )}
    </span>
  );
}

function ReportsTable({ reports }: { reports: ReportView[] }) {
  const sampleOn = useSettings((s) => s.sampleData);
  const { setModeration, remove } = useReportMutations();
  const [q, setQ] = useState('');
  const [type, setType] = useState<Any<ReportType>>('all');
  const [freshness, setFreshness] = useState<Any<Freshness>>('all');
  const [verification, setVerification] = useState<Any<Verification>>('all');
  const [moderation, setModerationFilter] = useState<Any<ModerationState>>('all');
  const [deleting, setDeleting] = useState<ReportView | null>(null);
  const deleted = useLatest(deleting);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return reports.filter(
      (r) =>
        (type === 'all' || r.type === type) &&
        (freshness === 'all' || r.freshness === freshness) &&
        (verification === 'all' || r.verification === verification) &&
        (moderation === 'all' || r.moderation === moderation) &&
        (!needle || [r.title, r.note ?? '', r.placeName ?? '', r.areaLabel, r.reporterName].some((v) => v.toLowerCase().includes(needle))),
    );
  }, [reports, q, type, freshness, verification, moderation]);

  const filtered = q.trim() !== '' || type !== 'all' || freshness !== 'all' || verification !== 'all' || moderation !== 'all';
  const clearFilters = () => {
    setQ('');
    setType('all');
    setFreshness('all');
    setVerification('all');
    setModerationFilter('all');
  };

  const actionsFor = (r: ReportView): (RowAction | false)[] => [
    Boolean(r.placeId) && { label: 'View place', icon: MapPin, to: `/place/${r.placeId}` },
    r.moderation === 'visible'
      ? { label: 'Hide update', icon: EyeOff, onSelect: () => setModeration.mutate({ id: r.id, state: 'hidden' }) }
      : { label: r.moderation === 'pending' ? 'Approve and show' : 'Restore update', icon: Eye, onSelect: () => setModeration.mutate({ id: r.id, state: 'visible' }) },
    r.moderation === 'pending' && { label: 'Hide update', icon: EyeOff, onSelect: () => setModeration.mutate({ id: r.id, state: 'hidden' }) },
    { label: 'Delete', icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(r) },
  ];

  const summary = (r: ReportView) => (
    <div className="flex min-w-0 items-start gap-3">
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', LEVEL_TILE[r.level])}>
        <Icon name={REPORT_TYPE_BY_ID[r.type].icon} className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <p className={cn('truncate font-semibold text-ink', r.freshness === 'expired' && 'font-medium text-ink-2')}>{r.title}</p>
        <p className="truncate text-[12.5px] text-muted-2">
          {REPORT_TYPE_BY_ID[r.type].label} · {r.placeName ?? r.areaLabel}
        </p>
        {r.note && <p className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-2">{r.note}</p>}
      </div>
    </div>
  );

  const columns: Column<ReportView>[] = [
    { id: 'update', header: 'Update', cell: (r) => <div className="max-w-[320px]">{summary(r)}</div> },
    {
      id: 'reporter',
      header: 'Reported by',
      cell: (r) => (
        <div className="max-w-[150px]">
          <p className="truncate text-ink-2">{r.reporterName}</p>
          <p className="truncate text-[12.5px] text-muted-2">{r.source === 'business' ? 'Business' : r.reporterLevel}</p>
        </div>
      ),
    },
    { id: 'freshness', header: 'Freshness', cell: (r) => <Badge tone={FRESHNESS[r.freshness].tone}>{FRESHNESS[r.freshness].label}</Badge> },
    { id: 'verification', header: 'Verification', cell: (r) => <Badge tone={VERIFICATION[r.verification].tone}>{VERIFICATION[r.verification].label}</Badge> },
    { id: 'votes', header: 'Votes', cell: (r) => <Votes report={r} /> },
    { id: 'moderation', header: 'Moderation', cell: (r) => <ModerationBadge state={r.moderation} /> },
    {
      id: 'updated',
      header: 'Updated',
      cell: (r) => (
        <div className="tabular whitespace-nowrap text-[13px]">
          <p className="text-ink-2">{timeAgo(r.updatedAt)}</p>
          <p className="text-[12.5px] text-muted-2">{timeLeft(r.expiresAt)}</p>
        </div>
      ),
    },
    { id: 'actions', header: 'Actions', srOnlyHeader: true, align: 'right', cell: (r) => <RowMenu label={`Actions for ${r.title}`} actions={actionsFor(r)} className="ml-auto" /> },
  ];

  return (
    <>
      {sampleOn && (
        <Notice tone="sample" className="mb-4">
          This table lists real updates only. The sample updates people see in the app are generated around each visitor and are never stored; if someone flags one it shows up in{' '}
          <Link to="/admin/moderation" className="font-medium underline underline-offset-2">
            Moderation
          </Link>
          .
        </Notice>
      )}

      <Toolbar>
        <SearchField value={q} onChange={setQ} placeholder="Search update, place or reporter" label="Search live updates" />
        <FilterSelect label="Report type" value={type} onChange={setType} options={TYPE_OPTIONS} />
        <FilterSelect label="Freshness" value={freshness} onChange={setFreshness} options={FRESHNESS_OPTIONS} />
        <FilterSelect label="Verification" value={verification} onChange={setVerification} options={VERIFICATION_OPTIONS} />
        <FilterSelect label="Moderation state" value={moderation} onChange={setModerationFilter} options={MODERATION_OPTIONS} />
      </Toolbar>

      <DataTable
        caption="Community live updates"
        noun={['update', 'updates']}
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        card={(r) => (
          <div>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">{summary(r)}</div>
              <RowMenu label={`Actions for ${r.title}`} actions={actionsFor(r)} />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <Badge tone={FRESHNESS[r.freshness].tone}>{FRESHNESS[r.freshness].label}</Badge>
              <Badge tone={VERIFICATION[r.verification].tone}>{VERIFICATION[r.verification].label}</Badge>
              <ModerationBadge state={r.moderation} />
              <Votes report={r} />
            </div>
            <p className="tabular mt-2 text-[12.5px] text-muted-2">
              {r.reporterName} · {timeAgo(r.updatedAt)} · {timeLeft(r.expiresAt)}
            </p>
          </div>
        )}
        empty={
          filtered ? (
            <EmptyState icon={SearchX} title="No updates match" description="Try a different search or clear the filters." action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>} />
          ) : (
            <EmptyState
              icon={Radio}
              title="No live updates stored yet"
              description="Updates people share about queues, closures, parking and more are listed here, with who confirmed or disputed them."
              action={
                <Button variant="secondary" asChild>
                  <Link to="/live">Open the live feed</Link>
                </Button>
              }
            />
          )
        }
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this update?"
        description={`“${deleted?.title ?? ''}” is removed for good, along with the points its reporter earned for it. To take it out of the feed but keep the record, hide it instead.`}
        confirmLabel="Delete update"
        destructive
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}

type Tab = 'updates' | 'policy';

export default function ReportsPage() {
  const reports = useReports();
  const config = useConfig();
  const [tab, setTab] = useState<Tab>('updates');

  return (
    <AdminPage title="Live reports" subtitle="Community updates with their freshness and verification, and the rules that decide both.">
      <Tabs
        value={tab}
        onChange={setTab}
        className="mb-5"
        tabs={[
          { value: 'updates', label: 'Updates', count: reports.data?.length },
          { value: 'policy', label: 'Expiry and trust policy' },
        ]}
      />
      {tab === 'updates' ? (
        <QueryState query={reports}>{(data) => <ReportsTable reports={data} />}</QueryState>
      ) : (
        <QueryState query={config}>{(cfg) => <PolicyForm config={cfg} sections={['expiry', 'trust']} saveLabel="Save policy" />}</QueryState>
      )}
    </AdminPage>
  );
}
