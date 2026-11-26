import { BadgeCheck, ChevronRight, CircleX, ClipboardCheck, FileText, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { CATEGORY_BY_ID } from '@/data/categories';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { BusinessListing } from '@/types';
import { ListingDetails } from '../components/ListingDetails';
import { AdminPage, NoteDialog, Panel, QueryState, VerificationBadge } from '../components/kit';
import { useLatest, useListingMutations, useListings } from '../hooks';

const inQueue = (l: BusinessListing) => l.verification === 'submitted' || l.verification === 'in_review';

function VerificationQueue({ listings }: { listings: BusinessListing[] }) {
  const isDesktop = useIsDesktop();
  const { review } = useListingMutations();
  // Requests already being looked at stay on top; within each group the oldest comes first.
  const queue = listings.filter(inQueue).sort((a, b) => Number(b.verification === 'in_review') - Number(a.verification === 'in_review') || a.updatedAt - b.updatedAt);
  const decided = listings.filter((l) => l.verification === 'verified' || l.verification === 'rejected').slice(0, 5);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<BusinessListing | null>(null);
  const rejected = useLatest(rejecting);

  const picked = queue.find((l) => l.id === selectedId) ?? null;
  // On a wide screen the detail pane is always filled; on a phone it opens on demand.
  const selected = picked ?? (isDesktop ? (queue[0] ?? null) : null);
  const sheetListing = useLatest(picked);

  const decisionButtons = (l: BusinessListing) => (
    <div className="flex flex-wrap gap-2.5">
      {l.verification === 'submitted' && (
        <Button variant="secondary" className="flex-1 sm:flex-none" loading={review.isPending && review.variables?.decision === 'in_review'} onClick={() => review.mutate({ id: l.id, decision: 'in_review' })}>
          <ClipboardCheck /> Mark in review
        </Button>
      )}
      <Button
        className="flex-1 sm:flex-none"
        loading={review.isPending && review.variables?.decision === 'verified'}
        onClick={() => review.mutate({ id: l.id, decision: 'verified' }, { onSuccess: () => setSelectedId(null) })}
      >
        <BadgeCheck /> Approve
      </Button>
      <Button variant="danger-soft" className="flex-1 sm:flex-none" onClick={() => setRejecting(l)}>
        <CircleX /> Reject
      </Button>
    </div>
  );

  if (!queue.length) {
    return (
      <div className="space-y-4">
        <div className="card">
          <EmptyState
            icon={BadgeCheck}
            title="No verification requests waiting"
            description="When a business submits its listing for verification it joins this queue."
            action={
              <Button variant="secondary" asChild>
                <Link to="/admin/businesses">View all businesses</Link>
              </Button>
            }
          />
        </div>
        <RecentlyDecided listings={decided} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section aria-label="Verification queue" className="card overflow-hidden">
          <p className="border-b border-line bg-surface-2/60 px-5 py-3 text-[13px] text-muted-2">
            <span className="tabular font-semibold text-ink">{queue.length}</span> waiting, in review first, then oldest
          </p>
          <ul className="divide-y divide-line">
            {queue.map((l) => {
              const current = selected?.id === l.id;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(l.id)}
                    aria-current={current ? 'true' : undefined}
                    className={cn('flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors', current ? 'bg-bg-2/70' : 'hover:bg-surface-2')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{l.name}</span>
                      <span className="block truncate text-[13px] text-muted-2">
                        {CATEGORY_BY_ID[l.categoryId]?.label ?? l.categoryId} · {l.ownerName}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <VerificationBadge status={l.verification} />
                        <span className="tabular text-[12px] text-muted">
                          {l.verification === 'in_review' ? 'Picked up' : 'Submitted'} {timeAgo(l.updatedAt)}
                        </span>
                        {l.placeId && (
                          <span className="inline-flex items-center gap-1 text-[12px] text-muted-2">
                            <MapPin className="size-3" aria-hidden /> Claims a place
                          </span>
                        )}
                        {l.verificationDoc && (
                          <span className="inline-flex items-center gap-1 text-[12px] text-muted-2">
                            <FileText className="size-3" aria-hidden /> Document
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight className={cn('size-4 shrink-0', current ? 'text-brand' : 'text-muted')} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {selected && (
          <section aria-label={`Details for ${selected.name}`} className="card hidden lg:block">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5">
              <div className="min-w-0">
                <h2 className="display-sm text-[22px] text-ink">{selected.name}</h2>
                <p className="mt-0.5 text-[13px] text-muted-2">Listed by {selected.ownerName}</p>
              </div>
              {decisionButtons(selected)}
            </header>
            <ListingDetails listing={selected} className="p-5" />
          </section>
        )}
      </div>

      <RecentlyDecided listings={decided} />

      <Sheet
        open={!isDesktop && picked !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
        title={sheetListing?.name ?? 'Listing'}
        description={sheetListing ? `Listed by ${sheetListing.ownerName}` : undefined}
        size="lg"
        footer={sheetListing && decisionButtons(sheetListing)}
      >
        {sheetListing && <ListingDetails listing={sheetListing} />}
      </Sheet>

      <NoteDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={`Reject ${rejected?.name ?? 'listing'}`}
        description="A reason is required. The owner sees it in the business portal and can correct the listing and submit it again."
        label="Reason for the rejection"
        placeholder="For example: the address does not match the claimed place."
        confirmLabel="Reject listing"
        destructive
        loading={review.isPending}
        onConfirm={(note) =>
          rejecting &&
          review.mutate(
            { id: rejecting.id, decision: 'rejected', note },
            {
              onSuccess: () => {
                setRejecting(null);
                setSelectedId(null);
              },
            },
          )
        }
      />
    </div>
  );
}

function RecentlyDecided({ listings }: { listings: BusinessListing[] }) {
  if (!listings.length) return null;
  return (
    <Panel title="Recently decided" subtitle="The latest approvals and rejections" action={<Link to="/admin/businesses" className="text-[13px] font-medium text-brand-ink hover:underline">All businesses</Link>} bodyClassName="px-5 pb-2 pt-3">
      <ul className="divide-y divide-line">
        {listings.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{l.name}</span>
            <VerificationBadge status={l.verification} />
            <span className="tabular w-full text-[12.5px] text-muted-2 sm:w-auto">{timeAgo(l.updatedAt)}</span>
            {l.verification === 'rejected' && l.verificationNote && <span className="w-full text-[12.5px] text-muted-2">Reason: {l.verificationNote}</span>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default function VerificationPage() {
  const listings = useListings();
  return (
    <AdminPage title="Verification" subtitle="Check each request against its details and document, then approve it or send it back with a reason.">
      <QueryState query={listings}>{(data) => <VerificationQueue listings={data} />}</QueryState>
    </AdminPage>
  );
}
