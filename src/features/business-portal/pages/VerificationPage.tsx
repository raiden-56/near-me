import { ArrowRight, BadgeCheck, BadgePercent, MessageSquare, Radio, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { formatDay } from '@/lib/time';
import { listingIssues, PROOF_TYPES, type PortalListing } from '@/services/businessPortal';
import { Panel, PortalPage, VERIFICATION_META, VerificationBadge } from '../components/bits';
import { IssueList, VerificationForm, VerificationTimeline } from '../components/Verification';
import { usePortal } from '../context';
import { useSubmitVerification } from '../hooks';

const UNLOCKED: { icon: LucideIcon; title: string; body: string; to: string }[] = [
  { icon: Radio, title: 'Post live availability', body: 'Tell people nearby that you are open, busy or closed. It is marked “Business confirmed”.', to: '/business/availability' },
  { icon: BadgePercent, title: 'Publish offers', body: 'Discounts, happy hours and seasonal offers for people in your area.', to: '/business/offers' },
  { icon: MessageSquare, title: 'Reply to reviews', body: 'Your replies appear under each review, signed by your business.', to: '/business/reviews' },
];

/** What was sent with the request that is currently with the reviewers. */
function RequestDetails({ listing }: { listing: PortalListing }) {
  const request = listing.verificationRequest;
  const proof = PROOF_TYPES.find((p) => p.id === request?.proofType);
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">{VERIFICATION_META[listing.verification].summary}</p>
      <dl className="divide-y divide-line rounded-2xl border border-line text-sm">
        <div className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
          <dt className="text-muted-2">Sent</dt>
          <dd className="font-medium text-ink">{request ? formatDay(request.submittedAt) : 'Not recorded'}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
          <dt className="text-muted-2">Proof document</dt>
          <dd className="font-medium text-ink">{proof?.label ?? 'Not recorded'}</dd>
        </div>
        {request?.note && (
          <div className="px-3.5 py-2.5">
            <dt className="text-muted-2">Your note</dt>
            <dd className="mt-1 whitespace-pre-line text-ink">{request.note}</dd>
          </div>
        )}
      </dl>
      {listing.verificationDoc ? (
        <figure className="flex items-center gap-3.5">
          <img src={listing.verificationDoc} alt="The document you sent" className="size-20 rounded-xl border border-line object-cover" />
          <figcaption className="text-[13px] text-muted-2">The document you attached. Only NearMe reviewers can see it.</figcaption>
        </figure>
      ) : (
        <p className="text-[13px] text-muted-2">No document image was attached. A reviewer may ask for one.</p>
      )}
      <p className="text-[13px] text-muted-2">You can keep editing your listing while you wait. There is nothing more to do here.</p>
    </div>
  );
}

export default function VerificationPage() {
  const { listing } = usePortal();
  const submit = useSubmitVerification();
  const status = listing.verification;
  const canSubmit = status === 'draft' || status === 'rejected';
  const issues = canSubmit ? listingIssues(listing) : [];

  return (
    <PortalPage
      title="Verification"
      subtitle="The Verified badge tells customers that the person managing this listing really runs the business."
      eyebrow={<VerificationBadge status={status} />}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <Panel title="Progress">
          <VerificationTimeline listing={listing} />
        </Panel>

        {canSubmit ? (
          issues.length > 0 ? (
            <Panel title="Almost ready" description="Verification compares your listing with your document, so the basics have to be filled in first.">
              <IssueList issues={issues} hrefFor={(issue) => (status === 'draft' ? `/business/onboarding?listing=${listing.id}&step=${issue.step}` : issue.to)} />
              {status === 'draft' && (
                <Button asChild className="mt-5">
                  <Link to={`/business/onboarding?listing=${listing.id}`}>
                    Continue setup <ArrowRight />
                  </Link>
                </Button>
              )}
            </Panel>
          ) : (
            <Panel
              title={status === 'rejected' ? 'Resubmit your request' : 'Submit for verification'}
              description={status === 'rejected' ? 'Fix what the reviewer pointed out, then send it again.' : 'Choose the document you can provide. One is enough.'}
            >
              <VerificationForm key={`${listing.id}-${status}`} listing={listing} onSubmit={(input) => submit.mutateAsync({ id: listing.id, input })} />
            </Panel>
          )
        ) : status === 'verified' ? (
          <Panel title="You are verified" description="Customers see the badge next to your name everywhere your listing appears.">
            <p className="flex items-center gap-2 text-sm font-medium text-success">
              <BadgeCheck className="size-5" aria-hidden /> {listing.name} is a verified business on NearMe.
            </p>
            <ul className="mt-5 space-y-2.5">
              {UNLOCKED.map(({ icon: IconCmp, title, body, to }) => (
                <li key={to}>
                  <Link to={to} className="group flex items-start gap-3.5 rounded-2xl border border-line p-3.5 transition-colors hover:border-line-2 hover:bg-surface-2">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-2 text-ink-2">
                      <IconCmp className="size-[18px]" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-ink">{title}</span>
                      <span className="mt-0.5 block text-[13px] text-muted-2">{body}</span>
                    </span>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <Panel title={status === 'in_review' ? 'A reviewer is looking at it' : 'Your request is in the queue'}>
            <RequestDetails listing={listing} />
          </Panel>
        )}
      </div>
    </PortalPage>
  );
}
