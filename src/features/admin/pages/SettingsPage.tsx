import { useQueryClient } from '@tanstack/react-query';
import { Check, HardDrive, Store, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, Notice } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/sheet';
import { hasBackend } from '@/lib/env';
import { cn } from '@/lib/utils';
import type { BusinessListing, PlanId } from '@/types';
import { PolicyForm } from '../components/PolicyForm';
import { AdminPage, DataTable, formatCount, Panel, PLAN_META, PlanBadge, QueryState, SearchField, VerificationBadge, type Column } from '../components/kit';
import { useConfig, useListingMutations, useListings, useResetLocalData } from '../hooks';

const PLANS: { id: PlanId; audience: string; features: string[] }[] = [
  {
    id: 'free',
    audience: 'Every business starts here',
    features: ['Claim or create a listing', 'Keep hours, contact details and photos current', 'Reply to reviews', 'Apply for the verified badge'],
  },
  {
    id: 'plus',
    audience: 'For businesses that want to be found',
    features: ['Everything in Free', 'Publish deals and offers', 'Post live availability and waiting times', 'Listing analytics for the last 30 days'],
  },
  {
    id: 'pro',
    audience: 'For busy and multi-location businesses',
    features: ['Everything in Plus', 'Promoted placement for deals', 'Priority in the verification queue', 'Full analytics history'],
  },
];

const PLAN_IDS: PlanId[] = ['free', 'plus', 'pro'];

function Plans({ listings }: { listings: BusinessListing[] }) {
  const { setPlan } = useListingMutations();
  const [q, setQ] = useState('');
  const counts = useMemo(() => {
    const out: Record<PlanId, number> = { free: 0, plus: 0, pro: 0 };
    for (const l of listings) out[l.plan]++;
    return out;
  }, [listings]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? listings.filter((l) => [l.name, l.ownerName].some((v) => v.toLowerCase().includes(needle))) : listings;
  }, [listings, q]);

  const planSelect = (l: BusinessListing) => (
    <div className="w-[124px]">
      <Select
        aria-label={`Plan for ${l.name}`}
        value={l.plan}
        disabled={setPlan.isPending}
        onChange={(e) => setPlan.mutate({ id: l.id, plan: e.target.value as PlanId })}
        className="h-9 text-[13px]"
      >
        {PLAN_IDS.map((p) => (
          <option key={p} value={p}>
            {PLAN_META[p].label}
          </option>
        ))}
      </Select>
    </div>
  );

  const columns: Column<BusinessListing>[] = [
    {
      id: 'business',
      header: 'Business',
      cell: (l) => (
        <div className="max-w-[300px]">
          <p className="truncate font-semibold text-ink">{l.name}</p>
          <p className="truncate text-[12.5px] text-muted-2">{l.ownerName}</p>
        </div>
      ),
    },
    { id: 'verification', header: 'Verification', cell: (l) => <VerificationBadge status={l.verification} /> },
    { id: 'current', header: 'Current plan', cell: (l) => <PlanBadge plan={l.plan} /> },
    { id: 'plan', header: 'Change plan', align: 'right', cell: (l) => <div className="flex justify-end">{planSelect(l)}</div> },
  ];

  return (
    <Panel title="Subscription plans" subtitle="What each plan includes, and which plan every listing is on">
      <ul className="grid gap-3 md:grid-cols-3">
        {PLANS.map((plan) => (
          <li key={plan.id} className={cn('rounded-2xl border p-4', plan.id === 'pro' ? 'border-line-2 bg-surface-2' : 'border-line')}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="display-sm text-[19px] text-ink">{PLAN_META[plan.id].label}</h3>
              <p className="tabular text-[13px] text-muted-2">
                <span className="font-semibold text-ink">{formatCount(counts[plan.id])}</span> {counts[plan.id] === 1 ? 'listing' : 'listings'}
              </p>
            </div>
            <p className="mt-0.5 text-[13px] text-muted-2">{plan.audience}</p>
            <ul className="mt-3 space-y-1.5">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13.5px] text-ink-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {f}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12.5px] text-muted-2">Plans are assigned by an administrator. Billing is not connected, so changing a plan here does not charge anyone.</p>

      <div className="mt-5">
        {listings.length > 0 && <SearchField value={q} onChange={setQ} placeholder="Search business or owner" label="Search listings" className="mb-3" />}
        <DataTable
          caption="Plan for each business listing"
          noun={['listing', 'listings']}
          pageSize={10}
          embedded
          rows={rows}
          columns={columns}
          rowKey={(l) => l.id}
          card={(l) => (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-ink">{l.name}</p>
                <p className="truncate text-[13px] text-muted-2">{l.ownerName}</p>
                <div className="mt-1.5">
                  <VerificationBadge status={l.verification} />
                </div>
              </div>
              {planSelect(l)}
            </div>
          )}
          empty={
            listings.length ? (
              <EmptyState compact icon={Store} title="No listings match" description="Try a different search." action={<Button variant="secondary" onClick={() => setQ('')}>Clear search</Button>} />
            ) : (
              <EmptyState
                compact
                icon={Store}
                title="No listings to assign a plan to"
                description="Listings created in the business portal start on the Free plan and show up here."
                action={
                  <Button variant="secondary" asChild>
                    <Link to="/admin/businesses">View businesses</Link>
                  </Button>
                }
              />
            )
          }
        />
      </div>
    </Panel>
  );
}

function DangerZone() {
  const qc = useQueryClient();
  const reset = useResetLocalData();
  const [confirming, setConfirming] = useState(false);
  return (
    <section aria-labelledby="danger-zone" className="rounded-2xl border border-danger/30 bg-danger-soft/40 p-5">
      <h2 id="danger-zone" className="display-sm flex items-center gap-2 text-[19px] text-ink">
        <TriangleAlert className="size-5 text-danger" strokeWidth={1.75} aria-hidden /> Danger zone
      </h2>
      <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Reset local data</p>
          <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-ink-2">
            Clears every account, review, live update, listing, deal, event, saved place, notification, moderation decision and configuration change stored on this device. Your own
            administrator account stays signed in. Map data and app preferences are not touched.
          </p>
        </div>
        <Button variant="danger" className="shrink-0" onClick={() => setConfirming(true)}>
          <Trash2 /> Reset local data
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Reset all local data?"
        description="Everything the local backend has stored on this device is deleted and the configuration returns to its defaults. This cannot be undone."
        confirmLabel="Delete everything"
        destructive
        loading={reset.isPending}
        onConfirm={() =>
          reset.mutate(undefined, {
            onSuccess: () => {
              setConfirming(false);
              // Every screen in the app reads from the store that was just cleared.
              void qc.invalidateQueries();
            },
          })
        }
      />
    </section>
  );
}

export default function SettingsPage() {
  const config = useConfig();
  const listings = useListings();
  return (
    <AdminPage title="Settings" subtitle="Platform configuration, subscription plans and local data.">
      <div className="space-y-8">
        <Notice icon={HardDrive}>
          {hasBackend
            ? 'A backend is connected for sign-in. Community data and this configuration are still read from the local store on this device until the Supabase tables are wired in.'
            : 'Local mode: this configuration is stored on this device and applies to the app running here.'}
        </Notice>

        <QueryState query={config}>{(cfg) => <PolicyForm config={cfg} sections={['expiry', 'trust', 'approval', 'categories']} allowReset saveLabel="Save configuration" />}</QueryState>

        <QueryState query={listings}>{(data) => <Plans listings={data} />}</QueryState>

        <DangerZone />
      </div>
    </AdminPage>
  );
}
