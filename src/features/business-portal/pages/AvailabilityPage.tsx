import { zodResolver } from '@hookform/resolvers/zod';
import { BadgeCheck, Check, Clock, Radio, ShieldCheck } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, ErrorState, Notice } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { FieldError, Input, Label, Textarea } from '@/components/ui/field';
import { formatClock, timeAgo, timeLeft } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';
import { availabilitySchema, type AvailabilityInput } from '@/services/businessPortal';
import type { ReportView } from '@/types';
import { CharCount, Panel, PortalPage } from '../components/bits';
import { usePortal } from '../context';
import { useAvailabilityHistory, useClearAvailability, useSetAvailability } from '../hooks';
import { AVAILABILITY_META, AVAILABILITY_ORDER } from '../lib/availability';

const WAIT_PRESETS = [5, 10, 15, 20, 30, 45, 60];
const LEVEL_DOT: Record<ReportView['level'], string> = { good: 'bg-success', moderate: 'bg-warning', bad: 'bg-danger', info: 'bg-muted' };

function HistoryRow({ report }: { report: ReportView }) {
  const expired = report.freshness === 'expired';
  return (
    <li className="flex items-start gap-3 py-3">
      <span className={cn('mt-[7px] size-2 shrink-0 rounded-full', expired ? 'bg-line-2' : LEVEL_DOT[report.level])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium', expired ? 'text-ink-2' : 'text-ink')}>{report.title}</p>
        {report.note && <p className="mt-0.5 text-[13px] text-muted-2">{report.note}</p>}
        <p className="tabular mt-1 text-[12.5px] text-muted-2">
          Posted {timeAgo(report.updatedAt)} · {expired ? `expired at ${formatClock(report.expiresAt)}` : `showing until ${formatClock(report.expiresAt)}`}
        </p>
      </div>
      {expired ? <Badge tone="neutral">Expired</Badge> : <Badge tone="success">{report.freshness === 'live' ? 'Live' : 'Showing'}</Badge>}
    </li>
  );
}

export default function AvailabilityPage() {
  const { listing } = usePortal();
  const history = useAvailabilityHistory(listing.id);
  const publish = useSetAvailability();
  const clear = useClearAvailability();
  const expiryMinutes = useLocalDb((s) => s.config.expiryMinutes.availability);
  const verified = listing.verification === 'verified';

  const current = listing.availability;
  const liveReport = history.data?.find((r) => r.freshness !== 'expired' && r.type === 'availability');

  const form = useForm<AvailabilityInput>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: { status: current?.status ?? 'open', waitMinutes: current?.waitMinutes, note: current?.note ?? '' },
  });
  const { errors, isSubmitting } = form.formState;
  const status = useWatch({ control: form.control, name: 'status' });
  const waitMinutes = useWatch({ control: form.control, name: 'waitMinutes' });
  const note = useWatch({ control: form.control, name: 'note' });
  const asksForWait = status === 'busy' || status === 'limited';

  const submit = form.handleSubmit(async (values) => {
    try {
      const { report } = await publish.mutateAsync({ id: listing.id, input: values });
      if (report) toast.success('Status shared', { description: `Showing in NearMe Live as “Business confirmed” until ${formatClock(report.expiresAt)}.` });
      else toast.success('Status saved', { description: 'It will be shared in NearMe Live once your listing is verified.' });
    } catch {
      /* the hook has already shown why */
    }
  });

  return (
    <PortalPage title="Live availability" subtitle="Tell people nearby what is happening at your business right now. It takes two taps.">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start">
        <div className="space-y-5">
          {!verified && (
            <Notice
              tone="warning"
              icon={ShieldCheck}
              action={
                <Link to="/business/verification" className="shrink-0 text-[13px] font-semibold text-ink underline underline-offset-2">
                  Verification
                </Link>
              }
            >
              <span className="font-semibold text-ink">Until you are verified, your status is saved but not shared.</span> Updates marked “Business confirmed” have to come from a verified business. Once you are verified, posting here shares it in NearMe Live.
            </Notice>
          )}

          <Panel title="Set your status" description={`Each update is shown for ${expiryMinutes} minutes, then expires on its own so customers never see stale information.`}>
            <form onSubmit={submit} noValidate className="space-y-5">
              <div role="group" aria-label="Current status" className="grid grid-cols-2 gap-2.5">
                {AVAILABILITY_ORDER.map((s) => {
                  const meta = AVAILABILITY_META[s];
                  const active = status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={active}
                      onClick={() => form.setValue('status', s, { shouldDirty: true })}
                      className={cn(
                        'relative flex min-h-[76px] flex-col justify-center rounded-2xl border px-4 py-3 text-left transition-[border-color,background-color,transform] active:scale-[0.98]',
                        active ? meta.selected : 'border-line bg-surface hover:border-line-2 hover:bg-surface-2',
                      )}
                    >
                      <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                        <span className={cn('size-2.5 rounded-full', meta.dot)} aria-hidden />
                        {meta.label}
                        {active && <Check className="ml-auto size-[18px]" aria-hidden />}
                      </span>
                      <span className="mt-0.5 text-[13px] leading-snug text-ink-2">{meta.hint}</span>
                    </button>
                  );
                })}
              </div>

              {asksForWait && (
                <div>
                  <Label htmlFor="availability-wait">
                    Roughly how long is the wait? <span className="font-normal text-muted">(optional)</span>
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    {WAIT_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={waitMinutes === m}
                        onClick={() => form.setValue('waitMinutes', waitMinutes === m ? undefined : m, { shouldDirty: true, shouldValidate: true })}
                        className={cn(
                          'tabular h-10 rounded-[10px] border px-3 text-[13px] font-medium transition-colors',
                          waitMinutes === m ? 'border-forest bg-forest text-on-forest' : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
                        )}
                      >
                        {m} min
                      </button>
                    ))}
                    <div className="flex items-center gap-2">
                      <Input
                        id="availability-wait"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={240}
                        placeholder="Other"
                        aria-invalid={Boolean(errors.waitMinutes)}
                        className="tabular h-10 w-24"
                        value={waitMinutes ?? ''}
                        onChange={(e) => form.setValue('waitMinutes', e.target.value === '' ? undefined : Number(e.target.value), { shouldDirty: true, shouldValidate: true })}
                      />
                      <span className="text-[13px] text-muted-2">minutes</span>
                    </div>
                  </div>
                  <FieldError>{errors.waitMinutes?.message}</FieldError>
                </div>
              )}

              <div>
                <div className="flex items-end justify-between">
                  <Label htmlFor="availability-note">
                    Short note <span className="font-normal text-muted">(optional)</span>
                  </Label>
                  <span className="mb-1.5">
                    <CharCount value={note} max={140} />
                  </span>
                </div>
                <Textarea
                  id="availability-note"
                  rows={2}
                  className="min-h-[68px]"
                  aria-invalid={Boolean(errors.note)}
                  placeholder={status === 'closed' ? 'For example: closed for a family function, back tomorrow at 9.' : 'For example: fresh batch at 5 pm, or two chairs free right now.'}
                  {...form.register('note')}
                />
                <FieldError>{errors.note?.message}</FieldError>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] text-muted-2">
                  <Clock className="size-3.5 shrink-0" aria-hidden />
                  {verified ? `Expires automatically after ${expiryMinutes} minutes` : 'Saved on your listing until you are verified'}
                </p>
                <Button type="submit" variant="brand" loading={isSubmitting}>
                  <Radio /> {verified ? (liveReport ? 'Update status' : 'Share status') : 'Save status'}
                </Button>
              </div>
            </form>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Right now">
            {current ? (
              <div>
                <p className="flex items-center gap-2 text-[17px] font-semibold text-ink">
                  <span className={cn('size-2.5 rounded-full', AVAILABILITY_META[current.status].dot)} aria-hidden />
                  {AVAILABILITY_META[current.status].label}
                  {current.waitMinutes ? <span className="tabular text-sm font-normal text-muted-2">· about {current.waitMinutes} min wait</span> : null}
                </p>
                {current.note && <p className="mt-1.5 text-sm text-ink-2">{current.note}</p>}
                <p className="mt-2 text-[13px] text-muted-2">Set {timeAgo(current.updatedAt)}.</p>

                <div className={cn('mt-4 rounded-xl p-3 text-[13px]', liveReport ? 'bg-sage/60' : 'bg-bg-2')}>
                  {liveReport ? (
                    <>
                      <p className="flex items-center gap-1.5 font-medium text-success">
                        <BadgeCheck className="size-4" aria-hidden /> Business confirmed
                      </p>
                      <p className="tabular mt-1 text-ink-2">
                        Showing in NearMe Live until {formatClock(liveReport.expiresAt)} ({timeLeft(liveReport.expiresAt)}). Post again any time to refresh it.
                      </p>
                    </>
                  ) : verified ? (
                    <p className="text-ink-2">The live update for this status has expired, so customers no longer see it. Share your status again to bring it back.</p>
                  ) : (
                    <p className="text-ink-2">Not shown to customers yet. It will be shared once your listing is verified.</p>
                  )}
                </div>

                <Button variant="ghost" size="sm" className="mt-3 -ml-2" onClick={() => clear.mutate(listing.id)} loading={clear.isPending}>
                  Clear status
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-2">No status set. Customers see your regular opening hours.</p>
            )}
          </Panel>

          <Panel title="Recent updates" description="What this business has shared in NearMe Live in the last day.">
            {history.isPending ? (
              <div className="space-y-2.5" aria-busy="true" aria-label="Loading recent updates">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : history.isError ? (
              <ErrorState compact error={history.error} onRetry={() => void history.refetch()} title="We could not load your updates" />
            ) : !history.data?.length ? (
              <EmptyState
                compact
                icon={Radio}
                title="Nothing shared yet"
                description={verified ? 'Your updates appear here with the time they expire.' : 'Updates are shared, and listed here, once your listing is verified.'}
              />
            ) : (
              <ul className="divide-y divide-line">
                {history.data.map((r) => (
                  <HistoryRow key={r.id} report={r} />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PortalPage>
  );
}
