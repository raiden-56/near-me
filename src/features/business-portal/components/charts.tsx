import { useReducedMotion } from 'motion/react';
import { Bar, BarChart, BarStack, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { useSettings } from '@/store/settings';

/**
 * Charts for the portal. One y-axis per chart, hairline grid, 2px lines, slim bars, and a tooltip
 * that reads out every series at the hovered position. Series colours belong to the metric and are
 * passed in; text always uses the ink tokens, never the series colour.
 */

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  /** Second visual cue besides colour, for people who cannot tell two hues apart. */
  dashed?: boolean;
}

type Row = { label: string } & Record<string, number | string>;

const AXIS_TICK = { fill: 'var(--muted)', fontSize: 12 };
const MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };

function useStillCharts(): boolean {
  const system = useReducedMotion();
  const setting = useSettings((s) => s.reduceMotion);
  return Boolean(system) || setting;
}

function SeriesKey({ series, kind }: { series: SeriesDef; kind: 'line' | 'bar' }) {
  if (kind === 'bar') return <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: series.color }} aria-hidden />;
  return (
    <svg width="18" height="8" className="shrink-0" aria-hidden>
      <line x1="1" y1="4" x2="17" y2="4" stroke={series.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={series.dashed ? '5 4' : undefined} />
    </svg>
  );
}

export function ChartLegend({ series, kind, className }: { series: SeriesDef[]; kind: 'line' | 'bar'; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5 text-[13px] text-ink-2">
          <SeriesKey series={s} kind={kind} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

interface TooltipBodyProps {
  active?: boolean;
  label?: string | number;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>;
  series: SeriesDef[];
  kind: 'line' | 'bar';
  /** Prefix for the heading, e.g. "Week of". */
  labelPrefix?: string;
}

function TooltipBody({ active, label, payload, series, kind, labelPrefix }: TooltipBodyProps) {
  if (!active || !payload?.length) return null;
  const valueOf = (key: string) => {
    const hit = payload.find((p) => p.dataKey === key);
    return typeof hit?.value === 'number' ? hit.value : 0;
  };
  return (
    <div className="min-w-[156px] rounded-xl border border-line bg-surface px-3 py-2.5 shadow-float">
      <p className="text-[12.5px] font-medium text-muted-2">
        {labelPrefix ? `${labelPrefix} ` : ''}
        {label}
      </p>
      <ul className="mt-1.5 space-y-1">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-[13px]">
            <SeriesKey series={s} kind={kind} />
            <span className="tabular font-semibold text-ink">{valueOf(s.key).toLocaleString('en-IN')}</span>
            <span className="text-muted-2">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ChartProps {
  data: Row[];
  series: SeriesDef[];
  height?: number;
  /** Text alternative announced by screen readers. The data table carries the detail. */
  summary: string;
  labelPrefix?: string;
}

/** Change over time for one to three measures that share a scale. */
export function TrendLines({ data, series, height = 260, summary, labelPrefix }: ChartProps) {
  const still = useStillCharts();
  return (
    <div role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--line-2)' }} tick={AXIS_TICK} tickMargin={8} minTickGap={28} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={AXIS_TICK} />
          <Tooltip
            cursor={{ stroke: 'var(--line-2)', strokeWidth: 1 }}
            isAnimationActive={false}
            content={(p) => <TooltipBody active={p.active} label={p.label} payload={p.payload} series={series} kind="line" labelPrefix={labelPrefix} />}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? '5 4' : undefined}
              dot={false}
              activeDot={{ r: 4.5, fill: s.color, stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={!still}
              animationDuration={500}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Parts of a whole over time: slim stacked columns with a surface-coloured gap between segments. */
export function StackedBars({ data, series, height = 240, summary, labelPrefix }: ChartProps) {
  const still = useStillCharts();
  return (
    <div role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--line-2)' }} tick={AXIS_TICK} tickMargin={8} minTickGap={28} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} tick={AXIS_TICK} />
          <Tooltip
            cursor={{ fill: 'var(--bg-2)' }}
            isAnimationActive={false}
            content={(p) => <TooltipBody active={p.active} label={p.label} payload={p.payload} series={series} kind="bar" labelPrefix={labelPrefix} />}
          />
          <BarStack stackId="stack" radius={[4, 4, 0, 0]}>
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stroke="var(--surface)" strokeWidth={1} maxBarSize={24} isAnimationActive={!still} animationDuration={450} />
            ))}
          </BarStack>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One measure across a few categories, with the largest one picked out. */
export function HighlightBars({ data, dataKey, label, color, height = 220, summary }: { data: Row[]; dataKey: string; label: string; color: string; height?: number; summary: string }) {
  const still = useStillCharts();
  const max = Math.max(0, ...data.map((d) => Number(d[dataKey]) || 0));
  const series: SeriesDef[] = [{ key: dataKey, label, color }];
  return (
    <div role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={MARGIN}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--line-2)' }} tick={AXIS_TICK} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={36} tick={AXIS_TICK} />
          <Tooltip cursor={{ fill: 'var(--bg-2)' }} isAnimationActive={false} content={(p) => <TooltipBody active={p.active} label={p.label} payload={p.payload} series={series} kind="bar" />} />
          <Bar dataKey={dataKey} name={label} fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={!still} animationDuration={450}>
            {data.map((d) => (
              <Cell key={d.label} fill={color} fillOpacity={max > 0 && Number(d[dataKey]) === max ? 1 : 0.32} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** The same numbers as a table: nothing in a chart is reachable only by hovering. */
export function SeriesTable({ data, series, firstColumn, className }: { data: Row[]; series: SeriesDef[]; firstColumn: string; className?: string }) {
  return (
    <div className={cn('max-h-[360px] overflow-auto rounded-xl border border-line', className)}>
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead className="sticky top-0 bg-surface-2 text-left text-[13px] text-muted-2">
          <tr>
            <th scope="col" className="px-3.5 py-2.5 font-medium">
              {firstColumn}
            </th>
            {series.map((s) => (
              <th key={s.key} scope="col" className="px-3.5 py-2.5 text-right font-medium">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.map((row, i) => (
            <tr key={`${row.label}-${i}`}>
              <th scope="row" className="whitespace-nowrap px-3.5 py-2 text-left font-medium text-ink">
                {row.label}
              </th>
              {series.map((s) => (
                <td key={s.key} className="tabular px-3.5 py-2 text-right text-ink-2">
                  {Number(row[s.key] ?? 0).toLocaleString('en-IN')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
