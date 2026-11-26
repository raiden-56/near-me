import { Bookmark, ChartLine, Eye, Lock, Navigation, Phone, Search, Table2, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, Notice } from '@/components/common/states';
import { SampleTag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress, Skeleton } from '@/components/ui/controls';
import { cn } from '@/lib/utils';
import { Panel, PortalPage, StatTile } from '../components/bits';
import { ChartLegend, HighlightBars, SeriesTable, StackedBars, TrendLines, type SeriesDef } from '../components/charts';
import { usePortal } from '../context';
import { useInsights } from '../hooks';
import { conversion, formatRate, METRIC_ORDER, METRICS, toSeries, weekdayAverages, type Metric } from '../lib/insights';
import { INSIGHT_RANGES, planFor, planForInsightDays, type InsightRange } from '../plans';

const ICONS: Record<Metric, LucideIcon> = { view: Eye, impression: Search, direction: Navigation, call: Phone, save: Bookmark };

const series = (keys: Metric[], dashed?: Metric): SeriesDef[] => keys.map((key) => ({ key, label: METRICS[key].label, color: METRICS[key].color, dashed: key === dashed }));

const REACH = series(['view', 'impression'], 'impression');
const ACTIONS = series(['direction', 'call', 'save']);
const ALL = series([...METRIC_ORDER]);

/** A rate with a meter. The share is the figure; the bar only shows how full "everyone" would be. */
function RateFigure({ label, rate, detail }: { label: string; rate: number | null; detail: string }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-muted-2">{label}</p>
      <p className="mt-1.5 text-[26px] font-semibold leading-none text-ink">{formatRate(rate)}</p>
      <Progress value={rate ?? 0} tone="forest" className="mt-3" />
      <p className="mt-2 text-[12.5px] text-muted-2">{detail}</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const { listing } = usePortal();
  const plan = planFor(listing.plan);
  const [picked, setPicked] = useState<InsightRange>(30);
  const [showTable, setShowTable] = useState(false);
  // If the plan changed underneath us, fall back to the longest period it still includes.
  const days = picked <= plan.limits.insightsDays ? picked : ([...INSIGHT_RANGES].reverse().find((d) => d <= plan.limits.insightsDays) ?? 7);

  const { insights, isSample, isLoading, isFetching, isError, error, refetch } = useInsights(listing.id, days);

  const chart = useMemo(() => (insights ? toSeries(insights.daily) : null), [insights]);
  const weekdays = useMemo(() => (insights ? weekdayAverages(insights.daily) : []), [insights]);
  const rates = insights ? conversion(insights.totals) : null;
  const busiest = weekdays.reduce<(typeof weekdays)[number] | null>((best, d) => (d.value > (best?.value ?? 0) ? d : best), null);
  const lockedPlan = planForInsightDays(INSIGHT_RANGES.find((d) => d > plan.limits.insightsDays) ?? 0);
  const hasLocked = INSIGHT_RANGES.some((d) => d > plan.limits.insightsDays);
  const period = `the last ${days} days`;
  const weekly = chart?.unit === 'week';

  return (
    <PortalPage title="Insights" subtitle="How customers find your listing, and what they do next.">
      {/* One period control, above everything it scopes. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label="Period" className="inline-flex rounded-xl bg-bg-2 p-1">
          {INSIGHT_RANGES.map((d) => {
            const locked = d > plan.limits.insightsDays;
            const active = d === days;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={active}
                disabled={locked}
                title={locked ? `${d} days of history is part of the ${planForInsightDays(d).name} plan` : undefined}
                onClick={() => setPicked(d)}
                className={cn(
                  'tabular flex h-9 items-center gap-1.5 rounded-[9px] px-3 text-sm font-medium transition-colors',
                  active ? 'bg-surface text-ink shadow-card' : locked ? 'text-muted' : 'text-muted-2 hover:text-ink',
                )}
              >
                {locked && <Lock className="size-3.5" aria-hidden />}
                {d} days
              </button>
            );
          })}
        </div>
        {hasLocked && (
          <p className="text-[13px] text-muted-2">
            Longer history is part of {lockedPlan.name}.{' '}
            <Link to="/business/subscription" className="font-medium text-brand-ink underline-offset-4 hover:underline">
              Compare plans
            </Link>
          </p>
        )}
      </div>

      {isLoading ? (
        <div aria-busy="true" aria-label="Loading insights">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {METRIC_ORDER.map((m) => (
              <Skeleton key={m} className="h-[104px] rounded-2xl" />
            ))}
          </div>
          <Skeleton className="mt-5 h-[340px] rounded-2xl" />
        </div>
      ) : isError || !insights || !chart || !rates ? (
        <div className="card">
          <ErrorState error={error} onRetry={() => void refetch()} title="We could not load your insights" />
        </div>
      ) : !insights.hasData ? (
        <div className="card">
          <EmptyState
            icon={ChartLine}
            title="No insights yet"
            description={
              listing.verification === 'verified' || listing.placeId
                ? `Nothing was tracked in ${period}. Numbers appear here as customers find, open and act on your listing. Only real interactions are counted.`
                : 'Your listing is not visible to customers yet. Once it is verified, numbers appear here as people find, open and act on it.'
            }
            action={
              <Button asChild variant="secondary">
                <Link to={listing.verification === 'verified' ? '/business' : '/business/verification'}>{listing.verification === 'verified' ? 'Check your profile strength' : 'See verification status'}</Link>
              </Button>
            }
          />
        </div>
      ) : (
        // While a new period loads, the previous one stays in place, dimmed, so nothing jumps.
        <div className={cn('space-y-5 transition-opacity duration-200', isFetching && 'opacity-60')}>
          {isSample && (
            <Notice tone="sample">
              <span className="font-semibold text-ink">These are example figures.</span> Nothing has been tracked for this listing yet, so everything on this screen is <SampleTag className="mx-0.5" /> data that shows what your insights will look like. Real numbers replace it as customers interact with your listing. Switch sample data off in Settings to hide it.
            </Notice>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {METRIC_ORDER.map((m) => (
              <StatTile key={m} label={METRICS[m].label} icon={ICONS[m]} value={insights.totals[m].toLocaleString('en-IN')} sample={isSample} hint={METRICS[m].description} />
            ))}
          </div>

          <Panel title="Reach" description={`${weekly ? 'Weekly' : 'Daily'} views and search impressions over ${period}.`}>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <ChartLegend series={REACH} kind="line" />
              {isSample && <SampleTag label="Sample data" />}
            </div>
            <TrendLines
              data={chart.points}
              series={REACH}
              height={280}
              labelPrefix={weekly ? 'Week of' : undefined}
              summary={`Line chart of views and search impressions over ${period}: ${insights.totals.view} views and ${insights.totals.impression} search impressions in total.`}
            />
          </Panel>

          <Panel title="Actions" description={`What people did after opening your listing, ${weekly ? 'per week' : 'per day'}.`}>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <ChartLegend series={ACTIONS} kind="bar" />
              {isSample && <SampleTag label="Sample data" />}
            </div>
            <StackedBars
              data={chart.points}
              series={ACTIONS}
              labelPrefix={weekly ? 'Week of' : undefined}
              summary={`Stacked bar chart of direction requests, calls and saves over ${period}: ${insights.totals.direction} direction requests, ${insights.totals.call} calls and ${insights.totals.save} saves in total.`}
            />
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Conversion" description="Of the people who got this far, how many took the next step." action={isSample ? <SampleTag className="mt-1.5" /> : undefined}>
              <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <RateFigure label="Search to view" rate={rates.viewRate} detail={`${insights.totals.view.toLocaleString('en-IN')} views from ${insights.totals.impression.toLocaleString('en-IN')} impressions`} />
                <RateFigure label="View to directions" rate={rates.directionRate} detail={`${insights.totals.direction.toLocaleString('en-IN')} of ${insights.totals.view.toLocaleString('en-IN')} views`} />
                <RateFigure label="View to call" rate={rates.callRate} detail={`${insights.totals.call.toLocaleString('en-IN')} of ${insights.totals.view.toLocaleString('en-IN')} views`} />
              </div>
            </Panel>

            <Panel
              title="Busiest days"
              description={
                busiest && busiest.value > 0
                  ? `${busiest.full} is your busiest day, with about ${busiest.value.toLocaleString('en-IN')} interactions on average.`
                  : 'Average views, direction requests, calls and saves by day of the week.'
              }
              action={isSample ? <SampleTag className="mt-1.5" /> : undefined}
            >
              <HighlightBars
                data={weekdays.map((d) => ({ label: d.label, value: d.value }))}
                dataKey="value"
                label="Average interactions"
                color={METRICS.view.color}
                summary={`Bar chart of average daily interactions by day of the week over ${period}. ${weekdays.map((d) => `${d.full}: ${d.value}`).join(', ')}.`}
              />
            </Panel>
          </div>

          <Panel
            title="The numbers"
            description={`Every figure behind the charts, ${weekly ? 'week by week' : 'day by day'}.`}
            action={
              <Button variant="secondary" size="sm" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
                <Table2 /> {showTable ? 'Hide table' : 'Show table'}
              </Button>
            }
          >
            {showTable ? (
              <SeriesTable data={chart.points} series={ALL} firstColumn={weekly ? 'Week of' : 'Day'} />
            ) : (
              <p className="text-sm text-muted-2">Open the table to read exact values without hovering over the charts.</p>
            )}
          </Panel>
        </div>
      )}
    </PortalPage>
  );
}
