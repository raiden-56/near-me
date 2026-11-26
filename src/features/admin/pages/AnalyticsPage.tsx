import { HeartHandshake, MessageSquareText, Radio, SearchX, Star, Store } from 'lucide-react';
import { EmptyState, Notice } from '@/components/common/states';
import { Skeleton } from '@/components/ui/controls';
import { CATEGORY_BY_ID } from '@/data/categories';
import { CONTRIBUTION_LABEL, REPORT_TYPE_BY_ID } from '@/lib/community';
import { hasBackend } from '@/lib/env';
import type { AdminAnalytics, ReportOutcome } from '@/services/admin';
import { CHART, ChartCard, ChartLegend, ColumnChart, RankedBars, type SeriesDef } from '../components/charts';
import { AdminPage, BaselineToggle, formatCount, Panel, QueryState, StatCard } from '../components/kit';
import { useAnalytics, useSampleBaseline } from '../hooks';
import { sampleAnalytics } from '../lib/sample';

const OUTCOMES: (SeriesDef & { key: ReportOutcome })[] = [
  { key: 'verified', label: 'Verified', color: CHART.sage },
  { key: 'awaiting', label: 'Awaiting confirmation', color: CHART.butter },
  { key: 'disputed', label: 'Disputed', color: CHART.danger },
  { key: 'expired', label: 'Expired unconfirmed', color: CHART.neutral },
];

const sum = (list: number[]) => list.reduce((n, v) => n + v, 0);

function AnalyticsSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2" aria-busy="true" aria-label="Loading analytics">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-[340px] rounded-2xl" />
      ))}
    </div>
  );
}

function AnalyticsBody({ real, sample }: { real: AdminAnalytics; sample: AdminAnalytics | null }) {
  const withSample = Boolean(sample);
  const realNote = (text: string) => (withSample ? <p className="text-[12.5px] text-muted-2">{text}</p> : undefined);

  /* Contributions by kind */
  const kinds = real.contributionsByKind
    .map((k, i) => ({ label: CONTRIBUTION_LABEL[k.kind], real: k.count, count: k.count + (sample?.contributionsByKind[i]?.count ?? 0) }))
    .filter((k) => k.count > 0)
    .sort((a, b) => b.count - a.count);
  const realContributions = sum(real.contributionsByKind.map((k) => k.count));

  /* Reports by type and outcome */
  const outcomes = real.reportsByOutcome
    .map((r, i) => {
      const extra = sample?.reportsByOutcome[i];
      return {
        label: REPORT_TYPE_BY_ID[r.type].label,
        verified: r.verified + (extra?.verified ?? 0),
        awaiting: r.awaiting + (extra?.awaiting ?? 0),
        disputed: r.disputed + (extra?.disputed ?? 0),
        expired: r.expired + (extra?.expired ?? 0),
        total: r.total + (extra?.total ?? 0),
        real: r.total,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  const realReports = sum(real.reportsByOutcome.map((r) => r.total));

  /* Top categories by listings */
  const perCategory = new Map<string, { real: number; count: number }>();
  for (const c of real.topCategories) perCategory.set(c.categoryId, { real: c.count, count: c.count });
  for (const c of sample?.topCategories ?? []) {
    const cur = perCategory.get(c.categoryId) ?? { real: 0, count: 0 };
    perCategory.set(c.categoryId, { real: cur.real, count: cur.count + c.count });
  }
  const categories = [...perCategory.entries()]
    .map(([id, v]) => ({ label: CATEGORY_BY_ID[id]?.label ?? id, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const realListings = sum(real.topCategories.map((c) => c.count));

  /* Review rating distribution */
  const histogram = real.ratingHistogram.map((n, i) => n + (sample?.ratingHistogram[i] ?? 0));
  const ratings = histogram.map((n, i) => ({ label: i === 0 ? '1 star' : `${i + 1} stars`, count: n, real: real.ratingHistogram[i]! }));
  const reviewTotal = sum(histogram);
  const average = reviewTotal ? Math.round((sum(histogram.map((n, i) => n * (i + 1))) / reviewTotal) * 10) / 10 : null;

  return (
    <div className="space-y-4">
      {withSample && (
        <Notice tone="sample">
          Charts marked <span className="font-medium">Sample</span> add an example baseline to the real figures so their shape is readable. Each chart states its real total, and its table
          view lists real values next to the combined ones.
        </Notice>
      )}

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Contributions" icon={HeartHandshake} real={realContributions} sample={sample ? sum(sample.contributionsByKind.map((k) => k.count)) : 0} hint="All kinds, all time" />
        <StatCard label="Live updates posted" icon={Radio} real={realReports} sample={sample ? sum(sample.reportsByOutcome.map((r) => r.total)) : 0} hint="Stored updates, any state" to="/admin/reports" />
        <StatCard label="Reviews" icon={MessageSquareText} real={real.reviewCount} sample={sample?.reviewCount ?? 0} hint={real.averageRating ? `Average ${real.averageRating.toFixed(1)} of 5` : 'No ratings yet'} to="/admin/reviews" />
        <StatCard label="Business listings" icon={Store} real={realListings} sample={sample ? sum(sample.topCategories.map((c) => c.count)) : 0} hint="Across every category" to="/admin/businesses" />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Contributions by kind"
          subtitle="What people add to NearMe"
          sample={withSample}
          table={{
            columns: withSample ? ['Kind', 'Contributions', 'Real'] : ['Kind', 'Contributions'],
            rows: kinds.map((k) => (withSample ? [k.label, k.count, k.real] : [k.label, k.count])),
          }}
          empty={kinds.length === 0 ? <EmptyState compact icon={HeartHandshake} title="No contributions yet" description="Reviews, live updates, confirmations, photos and place edits are counted here." /> : undefined}
          footer={realNote(`Real contributions: ${formatCount(realContributions)}.`)}
        >
          <RankedBars data={kinds} series={[{ key: 'count', label: 'Contributions', color: CHART.sage }]} labelWidth={132} />
        </ChartCard>

        <ChartCard
          title="Reports by type and outcome"
          subtitle="How live updates ended up, by what they describe"
          sample={withSample}
          table={{
            columns: [...['Type', ...OUTCOMES.map((o) => o.label), 'Total'], ...(withSample ? ['Real total'] : [])],
            rows: outcomes.map((r) => [r.label, r.verified, r.awaiting, r.disputed, r.expired, r.total, ...(withSample ? [r.real] : [])]),
          }}
          empty={outcomes.length === 0 ? <EmptyState compact icon={Radio} title="No live updates yet" description="Once updates are posted, this shows how many were verified, disputed or expired unconfirmed." /> : undefined}
          footer={
            <div className="space-y-2">
              <ChartLegend items={OUTCOMES.map((o) => ({ label: o.label, color: o.color, value: sum(outcomes.map((r) => r[o.key])) }))} />
              {realNote(`Real updates: ${formatCount(realReports)}.`)}
            </div>
          }
        >
          <RankedBars data={outcomes} series={OUTCOMES} />
        </ChartCard>

        <ChartCard
          title="Top categories by listings"
          subtitle="Where businesses have claimed or created a listing"
          sample={withSample}
          table={{
            columns: withSample ? ['Category', 'Listings', 'Real'] : ['Category', 'Listings'],
            rows: categories.map((c) => (withSample ? [c.label, c.count, c.real] : [c.label, c.count])),
          }}
          empty={categories.length === 0 ? <EmptyState compact icon={Store} title="No listings yet" description="When businesses create listings, the busiest categories are ranked here." /> : undefined}
          footer={realNote(`Real listings: ${formatCount(realListings)}.`)}
        >
          <RankedBars data={categories} series={[{ key: 'count', label: 'Listings', color: CHART.clay }]} labelWidth={132} />
        </ChartCard>

        <ChartCard
          title="Review rating distribution"
          subtitle={average ? `${formatCount(reviewTotal)} reviews, average ${average.toFixed(1)} of 5` : 'How people rate the places they review'}
          sample={withSample}
          table={{
            columns: withSample ? ['Rating', 'Reviews', 'Real'] : ['Rating', 'Reviews'],
            rows: ratings.map((r) => (withSample ? [r.label, r.count, r.real] : [r.label, r.count])),
          }}
          empty={reviewTotal === 0 ? <EmptyState compact icon={Star} title="No reviews yet" description="The spread of star ratings appears once people start reviewing places." /> : undefined}
          footer={realNote(`Real reviews: ${formatCount(real.reviewCount)}${real.averageRating ? `, average ${real.averageRating.toFixed(1)} of 5` : ''}.`)}
        >
          <ColumnChart data={ratings} dataKey="count" name="Reviews" color={CHART.butter} />
        </ChartCard>
      </div>

      <Panel title="Search analytics" subtitle="What people look for">
        <EmptyState
          compact
          icon={SearchX}
          title={hasBackend ? 'Search logging is not set up' : 'Searches are not tracked in local mode'}
          description={
            hasBackend
              ? 'Search terms are not being collected, so there is nothing to chart. Recent searches stay in each person’s own settings on their device.'
              : 'There is no server to log to, so no search terms are collected. Recent searches stay in each person’s own settings on their device and never reach the admin area.'
          }
        />
      </Panel>
    </div>
  );
}

export default function AnalyticsPage() {
  const analytics = useAnalytics();
  const { on } = useSampleBaseline();
  return (
    <AdminPage title="Analytics" subtitle="A closer look at what the community contributes and how reliable it turns out to be." actions={<BaselineToggle />}>
      <QueryState query={analytics} skeleton={<AnalyticsSkeleton />}>
        {(data) => <AnalyticsBody real={data} sample={on ? sampleAnalytics() : null} />}
      </QueryState>
    </AdminPage>
  );
}
