import { zodResolver } from '@hookform/resolvers/zod';
import { BadgePercent, CalendarDays, Megaphone, Pencil, Plus, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, ErrorState, Notice } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton, Switch, Tabs } from '@/components/ui/controls';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ConfirmDialog, Sheet } from '@/components/ui/sheet';
import { DAY, formatDay, timeLeft } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';
import { dealToInput, offerSchema, offerState, toDateInput, type OfferInput, type OfferState, type PortalListing } from '@/services/businessPortal';
import type { Deal, DealKind } from '@/types';
import { CharCount, LimitMeter, Panel, PortalPage } from '../components/bits';
import { usePortal } from '../context';
import { useDeleteDeal, useListingDeals, useSaveDeal } from '../hooks';
import { planFor } from '../plans';

const KIND_LABEL: Record<DealKind, string> = {
  discount: 'Discount',
  offer: 'Special offer',
  happy_hour: 'Happy hour',
  seasonal: 'Seasonal',
  event: 'Event',
  limited: 'Limited time',
};

const EMPTY_COPY: Record<OfferState, { title: string; description: string }> = {
  active: { title: 'No offers running', description: 'Publish an offer to give people nearby a reason to choose you today.' },
  scheduled: { title: 'Nothing scheduled', description: 'Offers with a start date in the future wait here until they go live.' },
  expired: { title: 'No past offers', description: 'Offers move here when their end date passes. You can run them again from here.' },
};

/* ── Form ───────────────────────────────────────────────────────────────── */

interface OfferFormProps {
  listing: PortalListing;
  deal: Deal | null;
  /** Other offers of this listing that are live or scheduled. Used to explain the promoted limit. */
  others: Deal[];
  onDone: () => void;
}

function OfferForm({ listing, deal, others, onDone }: OfferFormProps) {
  const save = useSaveDeal();
  const plan = planFor(listing.plan);
  const needsApproval = useLocalDb((s) => s.config.dealsRequireApproval);
  const today = Date.now();

  const form = useForm<OfferInput>({
    resolver: zodResolver(offerSchema),
    defaultValues: deal
      ? // An expired offer opened to run again starts from today rather than from dates in the past.
        offerState(deal) === 'expired'
        ? { ...dealToInput(deal), startsOn: toDateInput(today), endsOn: toDateInput(today + 7 * DAY) }
        : dealToInput(deal)
      : { title: '', description: '', kind: 'discount', badge: '', code: '', terms: '', startsOn: toDateInput(today), endsOn: toDateInput(today + 7 * DAY), promoted: false },
    mode: 'onTouched',
  });
  const { errors, isSubmitting } = form.formState;
  const description = useWatch({ control: form.control, name: 'description' });
  const promoted = useWatch({ control: form.control, name: 'promoted' });
  const startsOn = useWatch({ control: form.control, name: 'startsOn' });

  const promotedInUse = others.filter((d) => d.promoted).length;
  const promotedBlocked =
    plan.limits.promotedOffers === 0
      ? `Promoted offers are not part of the ${plan.name} plan.`
      : promotedInUse >= plan.limits.promotedOffers
        ? `You are already using ${promotedInUse} of ${plan.limits.promotedOffers} promoted offer${plan.limits.promotedOffers === 1 ? '' : 's'} on the ${plan.name} plan.`
        : null;

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({ id: listing.id, input: values, dealId: deal?.id });
      const state = offerState(saved);
      if (saved.moderation === 'pending') toast.success('Offer sent for approval', { description: 'A moderator checks new offers before customers see them.' });
      else if (saved.moderation === 'hidden') toast('Offer saved', { description: 'It stays hidden: a moderator removed it from view.' });
      else if (state === 'scheduled') toast.success('Offer scheduled', { description: `It goes live on ${formatDay(saved.startsAt)}.` });
      else toast.success(deal ? 'Offer updated' : 'Offer published', { description: 'People nearby can see it now.' });
      onDone();
    } catch {
      /* the hook has already shown why */
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Title" htmlFor="offer-title" error={errors.title?.message} hint="Say exactly what the customer gets.">
        <Input id="offer-title" placeholder="20% off weekday breakfast" aria-invalid={Boolean(errors.title)} {...form.register('title')} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Badge" htmlFor="offer-badge" error={errors.badge?.message} hint="The big text on the offer card. Up to 18 characters.">
          <Input id="offer-badge" placeholder="20% off" maxLength={18} aria-invalid={Boolean(errors.badge)} {...form.register('badge')} />
        </Field>
        <Field label="Type" htmlFor="offer-kind" error={errors.kind?.message}>
          <Select id="offer-kind" aria-invalid={Boolean(errors.kind)} {...form.register('kind')}>
            {(Object.keys(KIND_LABEL) as DealKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Description" htmlFor="offer-description" error={errors.description?.message}>
        <Textarea id="offer-description" rows={3} className="min-h-[84px]" placeholder="What is included, who it is for, and how to get it." aria-invalid={Boolean(errors.description)} {...form.register('description')} />
        <div className="mt-1 text-right">
          <CharCount value={description} max={300} />
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" htmlFor="offer-start" error={errors.startsOn?.message}>
          <Input id="offer-start" type="date" aria-invalid={Boolean(errors.startsOn)} {...form.register('startsOn')} />
        </Field>
        <Field label="Ends" htmlFor="offer-end" error={errors.endsOn?.message} hint="Runs until the end of this day.">
          <Input id="offer-end" type="date" min={startsOn || undefined} aria-invalid={Boolean(errors.endsOn)} {...form.register('endsOn')} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code (optional)" htmlFor="offer-code" error={errors.code?.message} hint="Something customers say or show at the counter.">
          <Input id="offer-code" placeholder="NEARME20" maxLength={16} autoCapitalize="characters" aria-invalid={Boolean(errors.code)} {...form.register('code')} />
        </Field>
        <Field label="Terms (optional)" htmlFor="offer-terms" error={errors.terms?.message} hint="Limits and exclusions, in plain words.">
          <Input id="offer-terms" placeholder="Dine-in only. One per table." maxLength={200} aria-invalid={Boolean(errors.terms)} {...form.register('terms')} />
        </Field>
      </div>

      <div className={cn('rounded-2xl border p-4', promoted ? 'border-butter bg-butter-soft/50' : 'border-line bg-surface-2')}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="offer-promoted" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <Megaphone className="size-4" aria-hidden /> Promote this offer
            </label>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
              Promoted offers are shown more prominently. Customers always see them labelled <span className="font-semibold">“Promoted”</span>, so the extra placement is never mistaken for a recommendation.
            </p>
          </div>
          <Switch
            id="offer-promoted"
            checked={promoted}
            disabled={Boolean(promotedBlocked) && !promoted}
            onCheckedChange={(on) => form.setValue('promoted', on, { shouldDirty: true })}
            aria-describedby={promotedBlocked ? 'offer-promoted-note' : undefined}
          />
        </div>
        {promotedBlocked && !promoted && (
          <p id="offer-promoted-note" className="mt-2.5 text-[13px] text-muted-2">
            {promotedBlocked}{' '}
            <Link to="/business/subscription" className="font-medium text-brand-ink underline-offset-4 hover:underline">
              Compare plans
            </Link>
          </p>
        )}
      </div>

      {needsApproval && <Notice icon={ShieldCheck}>New and edited offers are checked by a NearMe moderator before customers see them.</Notice>}

      <div className="flex gap-2.5 border-t border-line pt-4">
        <Button type="button" variant="secondary" className="flex-1 sm:flex-none" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1 sm:ml-auto sm:flex-none" loading={isSubmitting}>
          {deal ? 'Save offer' : needsApproval ? 'Send for approval' : 'Publish offer'}
        </Button>
      </div>
    </form>
  );
}

/* ── Card ───────────────────────────────────────────────────────────────── */

function OfferCard({ deal, state, onEdit, onDelete }: { deal: Deal; state: OfferState; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className={cn('flex overflow-hidden rounded-2xl border bg-surface', deal.promoted ? 'border-butter' : 'border-line', state === 'expired' && 'opacity-80')}>
      <div className="flex w-[96px] shrink-0 flex-col items-center justify-center gap-1.5 border-r border-dashed border-line-2 bg-bg-2 px-2 py-4 text-center">
        <BadgePercent className="size-[18px] text-muted-2" strokeWidth={1.75} aria-hidden />
        <span className="display break-words text-[17px] leading-[1.1] text-ink">{deal.badge}</span>
      </div>
      <div className="min-w-0 flex-1 p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">{KIND_LABEL[deal.kind]}</Badge>
          {deal.promoted && (
            <Badge tone="butter">
              <Megaphone aria-hidden /> Promoted
            </Badge>
          )}
          {deal.moderation === 'pending' && <Badge tone="warning">Waiting for approval</Badge>}
          {deal.moderation === 'hidden' && <Badge tone="danger">Hidden by a moderator</Badge>}
        </div>
        <h3 className="mt-2 text-[15px] font-semibold leading-snug text-ink">{deal.title}</h3>
        <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-2">{deal.description}</p>
        <p className="tabular mt-2 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-ink-2">
          <CalendarDays className="size-3.5 text-muted-2" aria-hidden />
          {formatDay(deal.startsAt)} to {formatDay(deal.endsAt)}
          {state === 'active' && <span className="text-muted-2">· {timeLeft(deal.endsAt)}</span>}
          {state === 'scheduled' && <span className="text-muted-2">· starts in {timeLeft(deal.startsAt).replace(' left', '')}</span>}
          {deal.code && <span className="text-muted-2">· code {deal.code}</span>}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button variant="soft" size="sm" onClick={onEdit}>
            {state === 'expired' ? <RotateCcw /> : <Pencil />} {state === 'expired' ? 'Run again' : 'Edit'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger hover:bg-danger-soft hover:text-danger">
            <Trash2 /> Delete
          </Button>
        </div>
      </div>
    </li>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function OffersPage() {
  const { listing } = usePortal();
  const deals = useListingDeals(listing.id);
  const remove = useDeleteDeal();
  const plan = planFor(listing.plan);
  const verified = listing.verification === 'verified';

  const [tab, setTab] = useState<OfferState>('active');
  const [editing, setEditing] = useState<{ deal: Deal | null } | null>(null);
  const [deleting, setDeleting] = useState<Deal | null>(null);

  const all = deals.data ?? [];
  const byState: Record<OfferState, Deal[]> = { active: [], scheduled: [], expired: [] };
  for (const d of all) byState[offerState(d)].push(d);
  const live = [...byState.active, ...byState.scheduled];
  const atLimit = live.length >= plan.limits.activeOffers;
  const shown = byState[tab];

  const newOffer = (
    <Button onClick={() => setEditing({ deal: null })} disabled={!verified || atLimit}>
      <Plus /> New offer
    </Button>
  );

  return (
    <PortalPage title="Offers" subtitle="Give people nearby a reason to visit today. Offers appear on your listing and in Deals near you." actions={newOffer}>
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
            <span className="font-semibold text-ink">Only verified businesses can publish offers.</span> Customers trust offers because they come from the real owner. Finish verification and this unlocks.
          </Notice>
        )}

        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <LimitMeter label={`Offers live or scheduled on the ${plan.name} plan`} used={live.length} limit={plan.limits.activeOffers} className="w-full max-w-sm" />
            {atLimit && verified && (
              <p className="text-[13px] text-muted-2">
                You are at your plan's limit.{' '}
                <Link to="/business/subscription" className="font-medium text-brand-ink underline-offset-4 hover:underline">
                  Compare plans
                </Link>
              </p>
            )}
          </div>
        </Panel>

        <Panel bodyClassName="pt-3 sm:pt-4">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'active', label: 'Active', count: byState.active.length },
              { value: 'scheduled', label: 'Scheduled', count: byState.scheduled.length },
              { value: 'expired', label: 'Expired', count: byState.expired.length },
            ]}
          />
          {deals.isPending ? (
            <div className="space-y-3 pt-4" aria-busy="true" aria-label="Loading offers">
              <Skeleton className="h-28 rounded-2xl" />
              <Skeleton className="h-28 rounded-2xl" />
            </div>
          ) : deals.isError ? (
            <ErrorState compact error={deals.error} onRetry={() => void deals.refetch()} title="We could not load your offers" />
          ) : shown.length === 0 ? (
            <EmptyState compact icon={BadgePercent} title={EMPTY_COPY[tab].title} description={EMPTY_COPY[tab].description} action={tab !== 'expired' && verified && !atLimit ? newOffer : undefined} />
          ) : (
            <ul className="space-y-3 pt-4">
              {shown.map((deal) => (
                <OfferCard key={deal.id} deal={deal} state={tab} onEdit={() => setEditing({ deal })} onDelete={() => setDeleting(deal)} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Sheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.deal ? (offerState(editing.deal) === 'expired' ? 'Run this offer again' : 'Edit offer') : 'New offer'}
        description={`Shown on ${listing.name} and to people browsing deals nearby.`}
        size="lg"
      >
        {editing && <OfferForm key={editing.deal?.id ?? 'new'} listing={listing} deal={editing.deal} others={live.filter((d) => d.id !== editing.deal?.id)} onDone={() => setEditing(null)} />}
      </Sheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this offer?"
        description={deleting ? `“${deleting.title}” is removed from your listing and from customers' saved deals. This cannot be undone.` : ''}
        confirmLabel="Delete offer"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate({ id: listing.id, dealId: deleting.id }, { onSettled: () => setDeleting(null) });
        }}
      />
    </PortalPage>
  );
}
