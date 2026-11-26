import { BadgeCheck, Ban, ClipboardCheck, ExternalLink, Eye, SearchX, Store, Trash2, CircleX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, Sheet } from '@/components/ui/sheet';
import { CATEGORY_BY_ID } from '@/data/categories';
import { timeAgo } from '@/lib/time';
import type { BusinessListing, PlanId, VerificationStatus } from '@/types';
import { CategoryCell, ListingDetails } from '../components/ListingDetails';
import {
  AdminPage, DataTable, FilterSelect, NoteDialog, PLAN_META, PlanBadge, QueryState, RowMenu, SearchField, Toolbar, VERIFICATION_META, VerificationBadge,
  type Column, type RowAction,
} from '../components/kit';
import { useLatest, useListingMutations, useListings } from '../hooks';

type StatusFilter = 'all' | VerificationStatus;
type PlanFilter = 'all' | PlanId;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Any status' },
  ...(Object.keys(VERIFICATION_META) as VerificationStatus[]).map((s) => ({ value: s, label: VERIFICATION_META[s].label })),
];
const PLAN_OPTIONS: { value: PlanFilter; label: string }[] = [
  { value: 'all', label: 'Any plan' },
  ...(Object.keys(PLAN_META) as PlanId[]).map((p) => ({ value: p, label: `${PLAN_META[p].label} plan` })),
];

function BusinessesTable({ listings }: { listings: BusinessListing[] }) {
  const { review, remove } = useListingMutations();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState('all');
  const [plan, setPlan] = useState<PlanFilter>('all');

  const [viewing, setViewing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<BusinessListing | null>(null);
  const [deleting, setDeleting] = useState<BusinessListing | null>(null);
  // The open sheet follows the live record, so a decision made inside it is reflected at once.
  const viewed = useLatest(listings.find((l) => l.id === viewing) ?? null);
  const rejected = useLatest(rejecting);
  const deleted = useLatest(deleting);

  const categoryOptions = useMemo(() => {
    const ids = [...new Set(listings.map((l) => l.categoryId))].sort((a, b) => (CATEGORY_BY_ID[a]?.label ?? a).localeCompare(CATEGORY_BY_ID[b]?.label ?? b));
    return [{ value: 'all', label: 'Any category' }, ...ids.map((id) => ({ value: id, label: CATEGORY_BY_ID[id]?.label ?? id }))];
  }, [listings]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return listings.filter(
      (l) =>
        (status === 'all' || l.verification === status) &&
        (category === 'all' || l.categoryId === category) &&
        (plan === 'all' || l.plan === plan) &&
        (!needle || [l.name, l.ownerName, l.address, l.phone, l.email ?? ''].some((v) => v.toLowerCase().includes(needle))),
    );
  }, [listings, q, status, category, plan]);

  const filtered = q.trim() !== '' || status !== 'all' || category !== 'all' || plan !== 'all';
  const clearFilters = () => {
    setQ('');
    setStatus('all');
    setCategory('all');
    setPlan('all');
  };

  const actionsFor = (l: BusinessListing): (RowAction | false)[] => [
    { label: 'View details', icon: Eye, onSelect: () => setViewing(l.id) },
    { label: 'Open public page', icon: ExternalLink, to: `/place/${l.placeId ?? `l_${l.id}`}` },
    l.verification !== 'verified' && { label: 'Verify', icon: BadgeCheck, separated: true, onSelect: () => review.mutate({ id: l.id, decision: 'verified' }) },
    l.verification === 'submitted' && { label: 'Mark as in review', icon: ClipboardCheck, onSelect: () => review.mutate({ id: l.id, decision: 'in_review' }) },
    (l.verification === 'submitted' || l.verification === 'in_review') && { label: 'Reject', icon: CircleX, onSelect: () => setRejecting(l) },
    l.verification === 'verified' && { label: 'Suspend', icon: Ban, separated: true, onSelect: () => setRejecting(l) },
    { label: 'Delete', icon: Trash2, destructive: true, separated: true, onSelect: () => setDeleting(l) },
  ];

  const columns: Column<BusinessListing>[] = [
    {
      id: 'business',
      header: 'Business',
      cell: (l) => (
        <button type="button" onClick={() => setViewing(l.id)} className="block max-w-[280px] text-left">
          <span className="block truncate font-semibold text-ink hover:underline">{l.name}</span>
          <span className="block truncate text-[12.5px] text-muted-2">{l.address || 'No address'}</span>
        </button>
      ),
    },
    { id: 'category', header: 'Category', cell: (l) => <CategoryCell categoryId={l.categoryId} className="max-w-[180px]" /> },
    { id: 'owner', header: 'Owner', cell: (l) => <span className="block max-w-[160px] truncate text-ink-2">{l.ownerName}</span> },
    { id: 'plan', header: 'Plan', cell: (l) => <PlanBadge plan={l.plan} /> },
    { id: 'status', header: 'Verification', cell: (l) => <VerificationBadge status={l.verification} /> },
    { id: 'updated', header: 'Updated', cell: (l) => <span className="tabular whitespace-nowrap text-[13px] text-muted-2">{timeAgo(l.updatedAt)}</span> },
    { id: 'actions', header: 'Actions', srOnlyHeader: true, align: 'right', cell: (l) => <RowMenu label={`Actions for ${l.name}`} actions={actionsFor(l)} className="ml-auto" /> },
  ];

  const suspending = rejected?.verification === 'verified';

  return (
    <>
      <Toolbar>
        <SearchField value={q} onChange={setQ} placeholder="Search name, owner, address" label="Search businesses" />
        <FilterSelect label="Verification status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <FilterSelect label="Category" value={category} onChange={setCategory} options={categoryOptions} />
        <FilterSelect label="Plan" value={plan} onChange={setPlan} options={PLAN_OPTIONS} />
      </Toolbar>

      <DataTable
        caption="Business listings"
        noun={['listing', 'listings']}
        rows={rows}
        columns={columns}
        rowKey={(l) => l.id}
        card={(l) => (
          <div className="flex items-start gap-3">
            <button type="button" onClick={() => setViewing(l.id)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[15px] font-semibold text-ink">{l.name}</span>
              <span className="block truncate text-[13px] text-muted-2">
                {CATEGORY_BY_ID[l.categoryId]?.label ?? l.categoryId} · {l.ownerName}
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-1.5">
                <VerificationBadge status={l.verification} />
                <PlanBadge plan={l.plan} />
                <span className="tabular text-[12px] text-muted">Updated {timeAgo(l.updatedAt)}</span>
              </span>
            </button>
            <RowMenu label={`Actions for ${l.name}`} actions={actionsFor(l)} />
          </div>
        )}
        empty={
          filtered ? (
            <EmptyState icon={SearchX} title="No listings match" description="Try a different search or clear the filters." action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>} />
          ) : (
            <EmptyState
              icon={Store}
              title="No business listings yet"
              description="Listings appear here when an owner creates one in the business portal."
              action={
                <Button variant="secondary" asChild>
                  <Link to="/business">Open the business portal</Link>
                </Button>
              }
            />
          )
        }
      />

      <Sheet
        open={viewing !== null && Boolean(listings.find((l) => l.id === viewing))}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewed?.name ?? 'Listing'}
        description={viewed ? `Listed by ${viewed.ownerName}` : undefined}
        side="right"
        size="lg"
        footer={
          viewed && (
            <div className="flex flex-wrap gap-2.5">
              {viewed.verification !== 'verified' && (
                <Button className="flex-1" loading={review.isPending} onClick={() => review.mutate({ id: viewed.id, decision: 'verified' })}>
                  <BadgeCheck /> Verify
                </Button>
              )}
              {viewed.verification === 'verified' ? (
                <Button variant="danger-soft" className="flex-1" onClick={() => setRejecting(viewed)}>
                  <Ban /> Suspend
                </Button>
              ) : (
                (viewed.verification === 'submitted' || viewed.verification === 'in_review') && (
                  <Button variant="danger-soft" className="flex-1" onClick={() => setRejecting(viewed)}>
                    <CircleX /> Reject
                  </Button>
                )
              )}
            </div>
          )
        }
      >
        {viewed && <ListingDetails listing={viewed} />}
      </Sheet>

      <NoteDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={suspending ? `Suspend ${rejected?.name ?? 'listing'}` : `Reject ${rejected?.name ?? 'listing'}`}
        description={
          suspending
            ? 'The verified badge is removed and the listing is marked as rejected. The owner sees your note in the business portal.'
            : 'The owner sees this reason in the business portal and can fix the listing and submit it again.'
        }
        label={suspending ? 'Reason for the suspension' : 'Reason for the rejection'}
        placeholder={suspending ? 'For example: repeated reports that the business has closed.' : 'For example: the phone number could not be reached.'}
        confirmLabel={suspending ? 'Suspend listing' : 'Reject listing'}
        destructive
        loading={review.isPending}
        onConfirm={(note) => rejecting && review.mutate({ id: rejecting.id, decision: 'rejected', note, suspend: rejecting.verification === 'verified' }, { onSuccess: () => setRejecting(null) })}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleted?.name ?? 'this listing'}?`}
        description="The listing, its deals and its analytics are removed for good. Reviews of the place are kept. This cannot be undone."
        confirmLabel="Delete listing"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              setViewing(null);
            },
          })
        }
      />
    </>
  );
}

export default function BusinessesPage() {
  const listings = useListings();
  return (
    <AdminPage title="Businesses" subtitle="Every listing created in the business portal, with its plan and verification status.">
      <QueryState query={listings}>{(data) => <BusinessesTable listings={data} />}</QueryState>
    </AdminPage>
  );
}
