import { Check, CreditCard, Minus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Notice } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { offerState } from '@/services/businessPortal';
import type { PlanId } from '@/types';
import { LimitMeter, Panel, PortalPage } from '../components/bits';
import { usePortal } from '../context';
import { useChoosePlan, useListingDeals } from '../hooks';
import { formatPlanPrice, PLAN_COMPARISON, PLAN_ORDER, PLANS, planFor } from '../plans';

export default function SubscriptionPage() {
  const { listing } = usePortal();
  const choose = useChoosePlan();
  const deals = useListingDeals(listing.id);
  const [pending, setPending] = useState<PlanId | null>(null);

  const current = planFor(listing.plan);
  const liveOffers = (deals.data ?? []).filter((d) => offerState(d) !== 'expired');
  const promotedOffers = liveOffers.filter((d) => d.promoted).length;
  const target = pending ? PLANS[pending] : null;

  // Moving to a smaller plan never deletes anything; it only stops new additions until usage fits.
  const overages = target
    ? [
        listing.photos.length > target.limits.photos && `you have ${listing.photos.length} photos and ${target.name} includes ${target.limits.photos}`,
        liveOffers.length > target.limits.activeOffers && `you have ${liveOffers.length} offers running and ${target.name} includes ${target.limits.activeOffers}`,
        promotedOffers > target.limits.promotedOffers && `you have ${promotedOffers} promoted offer${promotedOffers === 1 ? '' : 's'} and ${target.name} includes ${target.limits.promotedOffers}`,
      ].filter((line): line is string => Boolean(line))
    : [];

  const confirm = () => {
    if (!target) return;
    choose.mutate(
      { id: listing.id, plan: target.id },
      {
        onSuccess: () => toast.success(`${listing.name || 'Your listing'} is on the ${target.name} plan`, { description: 'Nothing was charged. The new limits apply now.' }),
        onSettled: () => setPending(null),
      },
    );
  };

  return (
    <PortalPage title="Plans" subtitle="Every plan includes a verified listing, review replies and live availability. Bigger plans raise the limits.">
      <div className="space-y-6">
        <Notice icon={CreditCard}>
          <span className="font-semibold text-ink">Payments are not connected yet.</span> Choosing a plan here records it on your listing and applies its limits straight away, but nothing is charged and no card is asked for. The prices show what the paid plans are expected to cost once billing is switched on.
        </Notice>

        <div className="grid gap-4 lg:grid-cols-3">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const isCurrent = plan.id === current.id;
            return (
              <section key={plan.id} aria-label={`${plan.name} plan`} className={cn('card flex flex-col p-5 sm:p-6', isCurrent && 'border-forest')}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="display-sm text-[22px] text-ink">{plan.name}</h2>
                  {isCurrent && <Badge tone="forest">Current plan</Badge>}
                </div>
                <p className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-[32px] font-semibold leading-none text-ink">{formatPlanPrice(plan)}</span>
                  <span className="text-sm text-muted-2">{plan.monthlyPrice > 0 ? 'per month' : 'no charge'}</span>
                </p>
                <p className="mt-2 text-sm text-muted-2">{plan.tagline}</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.highlights.map((line) => (
                    <li key={line} className="flex gap-2.5 text-sm text-ink-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
                <Button className="mt-6 w-full" variant={isCurrent ? 'soft' : 'primary'} disabled={isCurrent} onClick={() => setPending(plan.id)}>
                  {isCurrent ? 'Your current plan' : `Choose ${plan.name}`}
                </Button>
              </section>
            );
          })}
        </div>

        <Panel title="Your usage" description={`What ${listing.name || 'this listing'} uses of the ${current.name} plan today.`}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <LimitMeter label="Photos" used={listing.photos.length} limit={current.limits.photos} />
            <LimitMeter label="Offers live or scheduled" used={liveOffers.length} limit={current.limits.activeOffers} />
            {current.limits.promotedOffers > 0 ? (
              <LimitMeter label="Promoted offers" used={promotedOffers} limit={current.limits.promotedOffers} />
            ) : (
              <div className="text-[13px]">
                <p className="font-medium text-ink-2">Promoted offers</p>
                <p className="mt-1.5 text-muted-2">Not included in {current.name}.</p>
              </div>
            )}
          </div>
          <p className="mt-5 border-t border-line pt-4 text-[13px] text-muted-2">Insights history: {current.limits.insightsDays} days.</p>
        </Panel>

        <Panel title="Compare plans" bodyClassName="px-0 pb-2 sm:px-0 sm:pb-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[13px] text-muted-2">
                  <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">
                    What is included
                  </th>
                  {PLAN_ORDER.map((id) => (
                    <th key={id} scope="col" className={cn('px-4 py-2.5 text-center font-medium', id === current.id && 'text-ink')}>
                      {PLANS[id].name}
                      {id === current.id && <span className="sr-only"> (current plan)</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN_COMPARISON.map((row) => (
                  <tr key={row.label} className="border-t border-line">
                    <th scope="row" className="px-5 py-3 text-left font-normal sm:px-6">
                      <span className="font-medium text-ink">{row.label}</span>
                      {row.hint && <span className="mt-0.5 block text-[12.5px] text-muted-2">{row.hint}</span>}
                    </th>
                    {PLAN_ORDER.map((id) => {
                      const value = row.value(PLANS[id]);
                      return (
                        <td key={id} className={cn('tabular px-4 py-3 text-center text-ink-2', id === current.id && 'bg-surface-2 font-medium text-ink')}>
                          {value === true ? (
                            <>
                              <Check className="mx-auto size-4 text-success" aria-hidden />
                              <span className="sr-only">Included</span>
                            </>
                          ) : value === false ? (
                            <>
                              <Minus className="mx-auto size-4 text-muted" aria-hidden />
                              <span className="sr-only">Not included</span>
                            </>
                          ) : (
                            value
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={target ? `Switch to ${target.name}?` : 'Switch plan?'}
        description={
          target
            ? `Nothing is charged: payments are not connected yet. The ${target.name} limits apply straight away.${
                overages.length ? ` Note that ${overages.join(', and ')}. Nothing is removed, but you cannot add more until you are within the limit.` : ''
              }`
            : ''
        }
        confirmLabel={target ? `Switch to ${target.name}` : 'Switch'}
        loading={choose.isPending}
        onConfirm={confirm}
      />
    </PortalPage>
  );
}
