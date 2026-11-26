import { zodResolver } from '@hookform/resolvers/zod';
import { Copy } from 'lucide-react';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Switch } from '@/components/ui/controls';
import { FieldError, Input } from '@/components/ui/field';
import { getOpenStatus, toOpeningHoursString, weekTable } from '@/lib/openingHours';
import { cn } from '@/lib/utils';
import { hoursSchema } from '@/services/businessPortal';
import type { DayKey, WeekHours } from '@/types';
import { DAY_LABEL, DAY_ORDER, hasOpenDay, isAllDay, suggestedWeek } from '../lib/hours';
import type { FormFooter } from './bits';

type DayErrors = Partial<Record<DayKey, string>>;

interface HoursEditorProps {
  value: WeekHours;
  onChange: (next: WeekHours) => void;
  errors?: DayErrors;
}

/** The week editor: per day an open/closed switch, opening and closing time, 24 hours, and copy to all days. */
export function HoursEditor({ value, onChange, errors }: HoursEditorProps) {
  const patch = (day: DayKey, change: Partial<WeekHours[DayKey]>) => onChange({ ...value, [day]: { ...value[day], ...change } });

  const copyToAll = (day: DayKey) => {
    const source = value[day];
    onChange(Object.fromEntries(DAY_ORDER.map((d) => [d, { ...source }])) as WeekHours);
    toast(source.closed ? 'Every day set to closed' : `${DAY_LABEL[day]}'s hours copied to every day`);
  };

  return (
    // Laid out by the width of the editor itself, so it works in the narrow wizard card and the wide manage screen alike.
    <ul className="@container divide-y divide-line">
      {DAY_ORDER.map((day) => {
        const d = value[day];
        const allDay = isAllDay(d);
        const error = errors?.[day];
        const actions = (
          <>
            {!d.closed && (
              <button
                type="button"
                aria-pressed={allDay}
                aria-label={`${DAY_LABEL[day]}: open 24 hours`}
                onClick={() => patch(day, allDay ? { open: '09:00', close: '21:00' } : { open: '00:00', close: '24:00' })}
                className={cn(
                  'h-9 shrink-0 rounded-[10px] border px-2.5 text-[13px] font-medium transition-colors',
                  allDay ? 'border-forest bg-forest text-on-forest' : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                24 hours
              </button>
            )}
            <button
              type="button"
              onClick={() => copyToAll(day)}
              title="Copy to all days"
              aria-label={`Copy ${DAY_LABEL[day]}'s hours to all days`}
              className="grid size-9 shrink-0 place-items-center rounded-[10px] text-muted-2 transition-colors hover:bg-bg-2 hover:text-ink"
            >
              <Copy className="size-4" aria-hidden />
            </button>
          </>
        );
        return (
          <li key={day} className="py-3.5 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-2.5 @xl:flex-row @xl:items-center @xl:gap-4">
              <div className="flex items-center gap-3 @xl:w-[164px] @xl:shrink-0">
                <Switch id={`hours-${day}`} checked={!d.closed} onCheckedChange={(open) => patch(day, { closed: !open })} aria-label={`${DAY_LABEL[day]}: open`} />
                <label htmlFor={`hours-${day}`} className="flex-1 text-[15px] font-medium text-ink">
                  {DAY_LABEL[day]}
                </label>
                {/* Narrow: the status and the row's actions share the first line with the day. */}
                <span className="flex items-center gap-1 @xl:hidden">
                  {d.closed && <span className="pr-1 text-sm text-muted-2">Closed</span>}
                  {actions}
                </span>
              </div>

              {d.closed ? (
                <p className="hidden flex-1 text-sm text-muted-2 @xl:block">Closed</p>
              ) : allDay ? (
                <p className="flex-1 pl-[58px] text-sm font-medium text-ink @xl:pl-0">Open 24 hours</p>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2 pl-[58px] @xl:pl-0">
                  <Input
                    type="time"
                    step={300}
                    value={d.open}
                    onChange={(e) => patch(day, { open: e.target.value })}
                    aria-label={`${DAY_LABEL[day]} opening time`}
                    aria-invalid={Boolean(error)}
                    className="tabular h-10 min-w-0 max-w-[132px] flex-1 px-2.5"
                  />
                  <span className="shrink-0 text-sm text-muted-2">to</span>
                  <Input
                    type="time"
                    step={300}
                    value={d.close}
                    onChange={(e) => patch(day, { close: e.target.value })}
                    aria-label={`${DAY_LABEL[day]} closing time`}
                    aria-invalid={Boolean(error)}
                    className="tabular h-10 min-w-0 max-w-[132px] flex-1 px-2.5"
                  />
                </div>
              )}

              <div className="hidden shrink-0 items-center gap-1 @xl:flex">{actions}</div>
            </div>
            {error && <FieldError>{error}</FieldError>}
            {!d.closed && !allDay && d.close < d.open && <p className="mt-1.5 pl-[58px] text-[13px] text-muted-2 @xl:pl-0">Closes after midnight, the next day.</p>}
          </li>
        );
      })}
    </ul>
  );
}

/** The week exactly as the consumer app renders it, including today's open or closed status. */
export function HoursPreview({ hours }: { hours: WeekHours }) {
  const raw = useMemo(() => toOpeningHoursString(hours), [hours]);
  const table = weekTable(raw);
  const status = getOpenStatus(raw);
  if (!table || !hasOpenDay(hours)) return <p className="text-sm text-muted-2">Customers see “Hours not listed” until you mark at least one day as open.</p>;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm">
        <span className={cn('size-1.5 rounded-full', status.state === 'closed' ? 'bg-danger' : status.state === 'closing_soon' ? 'bg-warning' : 'bg-success')} aria-hidden />
        <span className={cn('font-medium', status.state === 'closed' ? 'text-danger' : status.state === 'closing_soon' ? 'text-warning' : 'text-success')}>{status.label}</span>
        {status.detail && <span className="text-muted-2">· {status.detail}</span>}
      </p>
      <dl className="mt-3 space-y-1.5">
        {table.map((row) => (
          <div key={row.day} className={cn('flex items-baseline justify-between gap-4 text-sm', row.isToday ? 'font-semibold text-ink' : 'text-ink-2')}>
            <dt>
              {row.day}
              {row.isToday && <span className="ml-1.5 text-[12px] font-medium text-brand-ink">Today</span>}
            </dt>
            <dd className={cn('tabular text-right', row.closed && 'text-muted-2')}>{row.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const formSchema = z.object({ hours: hoursSchema });
type HoursValues = z.input<typeof formSchema>;

interface HoursFormProps {
  hours: WeekHours;
  onSubmit: (hours: WeekHours) => Promise<unknown>;
  footer: FormFooter;
  /** Shown next to the editor on wide screens: how customers will see these hours. */
  preview?: boolean;
}

export function HoursForm({ hours, onSubmit, footer, preview }: HoursFormProps) {
  // A listing with no hours yet opens on a sensible suggestion. It is only saved when the owner confirms it.
  const unset = !hasOpenDay(hours);
  const form = useForm<HoursValues>({ resolver: zodResolver(formSchema), defaultValues: { hours: unset ? suggestedWeek() : hours } });
  const { errors, isSubmitting, isDirty } = form.formState;
  const current = form.watch('hours');

  const dayErrors: DayErrors = {};
  for (const day of DAY_ORDER) {
    const e = errors.hours?.[day];
    const message = e?.close?.message ?? e?.open?.message;
    if (message) dayErrors[day] = message;
  }
  // An error about the week as a whole ("mark at least one day as open") sits on the field itself.
  const weekError = (errors.hours as { message?: string } | undefined)?.message;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values.hours);
      form.reset(values);
    } catch {
      /* reported by the caller */
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <div className={cn(preview && 'grid gap-8 lg:grid-cols-[1fr_300px]')}>
        <div>
          {unset && <p className="mb-4 rounded-xl bg-butter-soft/70 px-3.5 py-2.5 text-[13px] text-ink-2">We filled in a common pattern to start from. Adjust it to your real hours, then save.</p>}
          <Controller
            control={form.control}
            name="hours"
            render={({ field }) => <HoursEditor value={field.value} onChange={field.onChange} errors={dayErrors} />}
          />
          <FieldError>{weekError}</FieldError>
        </div>
        {preview && (
          <aside className="rounded-2xl border border-line bg-surface-2 p-4 lg:self-start">
            <p className="mb-3 text-[13px] font-medium text-muted-2">How customers see it</p>
            <HoursPreview hours={current} />
          </aside>
        )}
      </div>
      {/* A suggested week counts as a change: it still has to be saved. */}
      {footer({ submitting: isSubmitting, dirty: isDirty || unset, reset: () => form.reset() })}
    </form>
  );
}
