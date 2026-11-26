import {
  Activity, BadgeCheck, BadgePercent, CalendarDays, ChevronRight, CircleCheck, ClipboardCheck, Flag, HeartHandshake, MapPinPlus, MessageSquareText, Radio, Shapes,
  Store, TriangleAlert, UserPlus, Users, type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, Notice } from '@/components/common/states';
import { Skeleton } from '@/components/ui/controls';
import { REPORT_TYPE_BY_ID } from '@/lib/community';
import { greeting } from '@/lib/time';
import type { AdminOverview, AttentionCounts } from '@/services/admin';
import { useAuth } from '@/store/auth';
import { CHART, ChartCard, ChartLegend, DonutChart, RankedBars, TrendChart } from '../components/charts';
import { AdminPage, BaselineToggle, formatCount, Panel, QueryState, StatCard } from '../components/kit';
import { useOverview, useSampleBaseline } from '../hooks';
import { sampleOverview, type SampleOverview } from '../lib/sample';

const ATTENTION: { key: keyof AttentionCounts; one: string; many: string; to: string; icon: LucideIcon }[] = [
  { key: 'pendingVerification', one: 'business waiting for verification', many: 'businesses waiting for verification', to: '/admin/verification', icon: BadgeCheck },
  { key: 'openModeration', one: 'flagged item to review', many: 'flagged items to review', to: '/admin/moderation', icon: Flag },
  { key: 'flaggedReviews', one: 'review flagged by readers', many: 'reviews flagged by readers', to: '/admin/reviews', icon: MessageSquareText },
  { key: 'pendingReports', one: 'live update held back after disputes', many: 'live updates held back after disputes', to: '/admin/reports', icon: TriangleAlert },
  { key: 'pendingDeals', one: 'deal waiting for approval', many: 'deals waiting for approval', to: '/admin/deals', icon: BadgePercent },
  { key: 'pendingEvents', one: 'event waiting for approval', many: 'events waiting for approval', to: '/admin/events', icon: CalendarDays },
  { key: 'pendingSuggestions', one: 'place suggestion to check', many: 'place suggestions to check', to: '/admin/moderation?tab=suggestions', icon: MapPinPlus },
  { key: 'categorySuggestions', one: 'category suggestion', many: 'category suggestions', to: '/admin/categories', icon: Shapes },
];

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[136px] rounded-2xl" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-[320px] rounded-2xl xl:col-span-2" />
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
    </div>
  );
}

function NeedsAttention({ counts }: { counts: AttentionCounts }) {
  const items = ATTENTION.filter((a) => counts[a.key] > 0);
  return (
    <Panel title="Needs attention" subtitle="Real items waiting on a decision" bodyClassName={items.length ? 'px-2.5 pb-2.5 pt-3' : undefined}>
      {items.length ? (
        <ul>
          {items.map((a) => (
            <li key={a.key}>
              <Link to={a.to} className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-bg-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">
                  <a.icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 text-sm text-ink">
                  <span className="tabular font-semibold">{formatCount(counts[a.key])}</span> {counts[a.key] === 1 ? a.one : a.many}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={CircleCheck} title="Nothing is waiting" description="Verification requests, flags and approvals will be listed here as they come in." />
      )}
    </Panel>
  );
}

function DashboardBody({ data, sample }: { data: AdminOverview; sample: SampleOverview | null }) {
  const t = data.totals;
  const s = sample?.totals;
  const withSample = Boolean(sample);

  const daily = data.daily.map((p, i) => ({
    label: p.label,
    users: p.users + (sample?.daily[i]?.users ?? 0),
    contributions: p.contributions + (sample?.daily[i]?.contributions ?? 0),
  }));
  const realUsers14 = data.daily.reduce((n, p) => n + p.users, 0);
  const realContributions14 = data.daily.reduce((n, p) => n + p.contributions, 0);
  const totalUsers14 = daily.reduce((n, p) => n + p.users, 0);
  const totalContributions14 = daily.reduce((n, p) => n + p.contributions, 0);

  const byType = data.reportsByType
    .map((r, i) => ({ label: REPORT_TYPE_BY_ID[r.type].label, real: r.count, count: r.count + (sample?.reportsByType[i]?.count ?? 0) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const states = [
    { label: 'Visible', color: CHART.sage, real: data.contentByState.visible, value: data.contentByState.visible + (sample?.contentByState.visible ?? 0) },
    { label: 'Pending review', color: CHART.butter, real: data.contentByState.pending, value: data.contentByState.pending + (sample?.contentByState.pending ?? 0) },
    { label: 'Hidden', color: CHART.danger, real: data.contentByState.hidden, value: data.contentByState.hidden + (sample?.contentByState.hidden ?? 0) },
  ];
  const contentTotal = states.reduce((n, x) => n + x.value, 0);
  const realContent = states.reduce((n, x) => n + x.real, 0);

  return (
    <div className="space-y-4">
      {withSample && (
        <Notice tone="sample">
          Figures marked <span className="font-medium">Sample</span> include an example baseline so this dashboard is readable before real activity builds up. Each one also states its real
          count, and the queues only ever list real items. Switch to <span className="font-medium">Real only</span> to remove the baseline.
        </Notice>
      )}

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Total users" icon={Users} real={t.users} sample={s?.users} to="/admin/users" hint="Registered accounts" />
        <StatCard label="Active users, 7 days" icon={Activity} real={t.activeUsers7d} sample={s?.activeUsers7d} hint="Joined or contributed this week" />
        <StatCard label="New users, 7 days" icon={UserPlus} real={t.newUsers7d} sample={s?.newUsers7d} hint="Signed up this week" />
        <StatCard label="Total businesses" icon={Store} real={t.businesses} sample={s?.businesses} to="/admin/businesses" hint="Listings in the business portal" />
        <StatCard label="Verified businesses" icon={BadgeCheck} real={t.verifiedBusinesses} sample={s?.verifiedBusinesses} to="/admin/businesses" hint="Showing the verified badge" />
        <StatCard label="Total categories" icon={Shapes} real={t.categories} to="/admin/categories" hint={t.disabledCategories ? `${t.disabledCategories} switched off` : 'All switched on'} />
        <StatCard label="Live reports" icon={Radio} real={t.liveReports} sample={s?.liveReports} to="/admin/reports" hint="Current and visible right now" />
        <StatCard label="Pending verification" icon={ClipboardCheck} real={t.pendingVerification} to="/admin/verification" hint="Submitted or in review" alert />
        <StatCard label="Reported content" icon={Flag} real={t.openModeration} to="/admin/moderation" hint="Open moderation items" alert />
        <StatCard label="Active deals" icon={BadgePercent} real={t.activeDeals} sample={s?.activeDeals} to="/admin/deals" hint="Running and visible" />
        <StatCard label="Contributions" icon={HeartHandshake} real={t.contributions} sample={s?.contributions} to="/admin/analytics" hint="Reviews, updates, edits and more" />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Activity over 14 days"
          subtitle="New accounts and contributions per day"
          sample={withSample}
          table={{
            columns: withSample ? ['Day', 'New users', 'Contributions', 'Real new users', 'Real contributions'] : ['Day', 'New users', 'Contributions'],
            rows: daily.map((p, i) => (withSample ? [p.label, p.users, p.contributions, data.daily[i]!.users, data.daily[i]!.contributions] : [p.label, p.users, p.contributions])),
          }}
          empty={
            totalUsers14 + totalContributions14 === 0 ? (
              <EmptyState compact icon={Activity} title="No activity in the last 14 days" description="New accounts and contributions will be charted here day by day." />
            ) : undefined
          }
          footer={
            withSample ? (
              <p className="text-[12.5px] text-muted-2">
                Real in this period: <span className="tabular font-medium text-ink-2">{formatCount(realUsers14)}</span> new users and{' '}
                <span className="tabular font-medium text-ink-2">{formatCount(realContributions14)}</span> contributions.
              </p>
            ) : undefined
          }
        >
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-[13px] text-muted-2">New users</p>
              <p className="mb-2 text-xl font-semibold tracking-tight text-ink">{formatCount(totalUsers14)}</p>
              <TrendChart data={daily} dataKey="users" name="New users" color={CHART.brand} />
            </div>
            <div>
              <p className="text-[13px] text-muted-2">Contributions</p>
              <p className="mb-2 text-xl font-semibold tracking-tight text-ink">{formatCount(totalContributions14)}</p>
              <TrendChart data={daily} dataKey="contributions" name="Contributions" color={CHART.sage} />
            </div>
          </div>
        </ChartCard>

        <ChartCard
          title="Content by moderation state"
          subtitle="Reviews, live updates, deals and events"
          sample={withSample}
          table={{
            columns: withSample ? ['State', 'Items', 'Real'] : ['State', 'Items'],
            rows: states.map((x) => (withSample ? [x.label, x.value, x.real] : [x.label, x.value])),
          }}
          empty={contentTotal === 0 ? <EmptyState compact icon={MessageSquareText} title="No community content yet" description="Once people post reviews and updates, their moderation states show here." /> : undefined}
          footer={withSample ? <p className="text-[12.5px] text-muted-2">Real items on this device: <span className="tabular font-medium text-ink-2">{formatCount(realContent)}</span>.</p> : undefined}
        >
          <div className="flex flex-col items-center gap-5 sm:flex-row xl:flex-col">
            <DonutChart data={states} centerLabel="items" />
            <ChartLegend items={states} className="flex-col gap-y-2 sm:flex-1 xl:w-full xl:flex-row xl:justify-center" />
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Reports by type"
          subtitle="Live updates posted, by what they describe"
          sample={withSample}
          table={{
            columns: withSample ? ['Type', 'Reports', 'Real'] : ['Type', 'Reports'],
            rows: byType.map((r) => (withSample ? [r.label, r.count, r.real] : [r.label, r.count])),
          }}
          empty={byType.length === 0 ? <EmptyState compact icon={Radio} title="No live updates yet" description="When people share queues, closures or parking, the mix of report types appears here." /> : undefined}
          footer={
            withSample ? (
              <p className="text-[12.5px] text-muted-2">
                Real reports stored on this device: <span className="tabular font-medium text-ink-2">{formatCount(data.reportsByType.reduce((n, r) => n + r.count, 0))}</span>.
              </p>
            ) : undefined
          }
        >
          <RankedBars data={byType} series={[{ key: 'count', label: 'Reports', color: CHART.brand }]} />
        </ChartCard>

        <NeedsAttention counts={data.attention} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const user = useAuth((s) => s.user);
  const overview = useOverview();
  const { on } = useSampleBaseline();
  const firstName = user?.name.split(' ')[0];

  return (
    <AdminPage title={`${greeting()}${firstName ? `, ${firstName}` : ''}`} subtitle="How NearMe is doing, and what is waiting on you." actions={<BaselineToggle />}>
      <QueryState query={overview} skeleton={<DashboardSkeleton />}>
        {(data) => <DashboardBody data={data} sample={on ? sampleOverview(data) : null} />}
      </QueryState>
    </AdminPage>
  );
}
