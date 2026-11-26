import { ChartColumn, Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { cn } from '@/lib/utils';
import { Panel } from './kit';

/**
 * Chart palette: the NearMe brand hues. Identity is never carried by colour alone: every
 * multi-series chart has a legend with values, and every chart has a table view.
 */
export const CHART = {
  brand: '#E97845',
  sage: '#5E8767',
  butter: '#C49A1F',
  clay: '#A56A4B',
  danger: '#B4524A',
  /** De-emphasised series: follows the theme so it stays visible in dark mode. */
  neutral: 'var(--muted)',
} as const;

const AXIS_TICK = { fill: 'var(--muted)', fontSize: 11.5 } as const;
const num = (n: number) => n.toLocaleString('en-IN');

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

/* ── Card with a table-view twin ────────────────────────────────────────── */

interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  sample?: boolean;
  /** The same data as rows, so no value is only reachable by hovering. */
  table: ChartTable;
  /** Rendered instead of the chart when there is nothing to plot. */
  empty?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ChartCard({ title, subtitle, sample, table, empty, footer, children, className }: ChartCardProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const asTable = view === 'table';
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      sample={sample}
      className={className}
      action={
        !empty && (
          <button
            type="button"
            onClick={() => setView(asTable ? 'chart' : 'table')}
            aria-pressed={asTable}
            aria-label={asTable ? `Show ${title} as a chart` : `Show ${title} as a table`}
            title={asTable ? 'Show chart' : 'Show table'}
            className="grid size-9 place-items-center rounded-[10px] text-muted-2 transition-colors hover:bg-bg-2 hover:text-ink"
          >
            {asTable ? <ChartColumn className="size-[18px]" strokeWidth={1.75} aria-hidden /> : <Table2 className="size-[18px]" strokeWidth={1.75} aria-hidden />}
          </button>
        )
      }
    >
      {empty ?? (asTable ? <ChartDataTable table={table} /> : children)}
      {!empty && footer && <div className="mt-4 border-t border-line pt-3.5">{footer}</div>}
    </Panel>
  );
}

function ChartDataTable({ table }: { table: ChartTable }) {
  return (
    <div className="max-h-[320px] overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={c} scope="col" className={cn('border-b border-line pb-2 text-[12.5px] font-medium text-muted-2', i === 0 ? 'text-left' : 'pl-4 text-right')}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={String(row[0])}>
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="border-b border-line py-2 text-left font-normal text-ink">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className="tabular border-b border-line py-2 pl-4 text-right text-ink-2">
                    {typeof cell === 'number' ? num(cell) : cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Legend and tooltip ─────────────────────────────────────────────────── */

export function ChartLegend({ items, className }: { items: { label: string; color: string; value?: number }[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: item.color }} aria-hidden />
          {item.label}
          {item.value != null && <span className="tabular font-semibold text-ink">{num(item.value)}</span>}
        </li>
      ))}
    </ul>
  );
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.type !== 'none');
  return (
    <div className="min-w-[136px] rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] shadow-float">
      {label != null && label !== '' && <p className="mb-1 font-medium text-ink">{label}</p>}
      <ul className="space-y-0.5">
        {rows.map((p, i) => {
          const swatch = p.color ?? (p.payload as { fill?: string } | undefined)?.fill ?? p.fill;
          return (
            <li key={i} className="flex items-center gap-2 text-ink-2">
              <span className="size-2 shrink-0 rounded-[3px]" style={{ background: typeof swatch === 'string' ? swatch : 'var(--muted)' }} aria-hidden />
              <span>{p.name}</span>
              <span className="tabular ml-auto pl-3 font-semibold text-ink">{typeof p.value === 'number' ? num(p.value) : String(p.value ?? '')}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Charts ─────────────────────────────────────────────────────────────── */

type Datum = Record<string, string | number>;

/** One measure over time: a 2px line over a light wash. Two measures get two of these, never two axes. */
export function TrendChart({ data, dataKey, name, color, height = 168 }: { data: Datum[]; dataKey: string; name: string; color: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--line)' }} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={32} />
        <YAxis width={38} allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} />
        <Tooltip content={ChartTooltip} cursor={{ stroke: 'var(--line-2)' }} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.1} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Ranked horizontal bars. One series shows its value at the bar tip; several series stack,
 * separated by a 2px gap in the surface colour, and rely on the legend.
 */
export function RankedBars({ data, series, labelWidth = 118 }: { data: Datum[]; series: SeriesDef[]; labelWidth?: number }) {
  const stacked = series.length > 1;
  return (
    <ResponsiveContainer width="100%" height={Math.max(96, data.length * 32 + 30)}>
      <BarChart layout="vertical" data={data} margin={{ top: 0, right: stacked ? 10 : 44, bottom: 0, left: 0 }} barCategoryGap={7} accessibilityLayer>
        <CartesianGrid stroke="var(--line)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} />
        <YAxis type="category" dataKey="label" width={labelWidth} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-2)', fontSize: 12.5 }} />
        <Tooltip content={ChartTooltip} cursor={{ fill: 'var(--bg-2)' }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? 'stack' : undefined} maxBarSize={18} radius={stacked ? 2 : [0, 4, 4, 0]} stroke="var(--surface)" strokeWidth={stacked ? 2 : 0}>
            {!stacked && <LabelList dataKey={s.key} position="right" offset={8} fill="var(--ink-2)" fontSize={12} />}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vertical columns for a short ordered scale (star ratings). */
export function ColumnChart({ data, dataKey, name, color, height = 220 }: { data: Datum[]; dataKey: string; name: string; color: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--line)' }} tick={{ fill: 'var(--ink-2)', fontSize: 12.5 }} />
        <YAxis width={38} allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} />
        <Tooltip content={ChartTooltip} cursor={{ fill: 'var(--bg-2)' }} />
        <Bar dataKey={dataKey} name={name} fill={color} maxBarSize={24} radius={[4, 4, 0, 0]}>
          <LabelList dataKey={dataKey} position="top" offset={6} fill="var(--ink-2)" fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Part-to-whole for a handful of states. The legend beside it carries every value. */
export function DonutChart({ data, centerLabel, size = 176 }: { data: DonutSlice[]; centerLabel: string; size?: number }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  const slices = data.filter((d) => d.value > 0).map((d) => ({ label: d.label, value: d.value, fill: d.color }));
  return (
    <div className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart accessibilityLayer>
          <Pie data={slices} dataKey="value" nameKey="label" innerRadius="66%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="var(--surface)" strokeWidth={2} />
          <Tooltip content={ChartTooltip} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-[24px] font-semibold leading-none tracking-tight text-ink">{num(total)}</p>
          <p className="mt-1 text-[12px] text-muted-2">{centerLabel}</p>
        </div>
      </div>
    </div>
  );
}
