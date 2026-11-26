import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, CircleAlert, FileUp, HardDrive, Lock, Trash2, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Notice } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { FieldError, Label, Textarea } from '@/components/ui/field';
import { hasBackend } from '@/lib/env';
import { compressImage, IMAGE_TYPES, validateImage } from '@/lib/schemas';
import { formatDay } from '@/lib/time';
import { cn } from '@/lib/utils';
import { PROOF_TYPES, verificationSchema, type ListingIssue, type PortalListing, type VerificationInput } from '@/services/businessPortal';
import { CharCount, VERIFICATION_META, VerificationBadge } from './bits';

/* ── Timeline ───────────────────────────────────────────────────────────── */

type NodeState = 'done' | 'current' | 'todo' | 'failed';

const STAGE: Record<PortalListing['verification'], number> = { draft: 0, submitted: 1, in_review: 2, verified: 3, rejected: 3 };

/** draft → submitted → in review → verified / not approved, with the reviewer's note when there is one. */
export function VerificationTimeline({ listing, className }: { listing: PortalListing; className?: string }) {
  const status = listing.verification;
  const stage = STAGE[status];
  const request = listing.verificationRequest;
  const proof = PROOF_TYPES.find((p) => p.id === request?.proofType)?.label;

  const nodes: { title: string; detail: string }[] = [
    { title: 'Listing started', detail: `Created on ${formatDay(listing.createdAt)}. Only you can see it until it is verified.` },
    {
      title: 'Submitted for verification',
      detail: request && stage >= 1 ? `Sent on ${formatDay(request.submittedAt)}${proof ? ` with: ${proof}` : ''}.` : 'Send your details with one proof document.',
    },
    { title: 'In review', detail: stage === 1 ? 'Waiting for a NearMe reviewer to pick it up.' : 'A reviewer checks your details against the document.' },
    status === 'rejected'
      ? { title: 'Not approved', detail: 'The reviewer could not approve this request.' }
      : { title: 'Verified', detail: status === 'verified' ? 'The Verified badge is showing on your listing.' : 'The Verified badge appears on your listing.' },
  ];

  const stateOf = (i: number): NodeState => {
    if (status === 'verified') return 'done';
    if (status === 'rejected') return i === 3 ? 'failed' : 'done';
    return i < stage ? 'done' : i === stage ? 'current' : 'todo';
  };

  return (
    <ol className={cn('relative', className)} aria-label="Verification progress">
      {nodes.map((node, i) => {
        const state = stateOf(i);
        const last = i === nodes.length - 1;
        return (
          <li key={node.title} className="relative flex gap-4 pb-6 last:pb-0" aria-current={state === 'current' ? 'step' : undefined}>
            {!last && <span className={cn('absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px', stateOf(i + 1) === 'todo' ? 'bg-line-2' : 'bg-forest')} aria-hidden />}
            <span
              className={cn(
                'relative z-10 mt-0.5 grid size-[27px] shrink-0 place-items-center rounded-full border-2',
                state === 'done' && 'border-forest bg-forest text-on-forest',
                state === 'current' && 'border-brand bg-surface',
                state === 'todo' && 'border-line-2 bg-surface',
                state === 'failed' && 'border-danger bg-danger text-white',
              )}
              aria-hidden
            >
              {state === 'done' && <Check className="size-3.5" strokeWidth={3} />}
              {state === 'current' && <span className="size-2.5 rounded-full bg-brand" />}
              {state === 'failed' && <X className="size-3.5" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-[15px] font-semibold', state === 'todo' ? 'text-muted-2' : 'text-ink')}>
                {node.title}
                <span className="sr-only">{state === 'done' ? ' (done)' : state === 'current' ? ' (current step)' : state === 'failed' ? ' (not approved)' : ' (not started)'}</span>
              </p>
              <p className="mt-0.5 text-sm text-muted-2">{node.detail}</p>
              {last && listing.verificationNote && (
                <div className={cn('mt-3 rounded-xl border px-3.5 py-3 text-sm', status === 'rejected' ? 'border-danger/25 bg-danger-soft' : 'border-line bg-surface-2')}>
                  <p className="text-[12.5px] font-medium text-muted-2">Note from the reviewer</p>
                  <p className="mt-1 whitespace-pre-line text-ink">{listing.verificationNote}</p>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ── What is still missing ──────────────────────────────────────────────── */

export function IssueList({ issues, hrefFor }: { issues: ListingIssue[]; hrefFor: (issue: ListingIssue) => string }) {
  return (
    <Notice tone="warning" icon={CircleAlert}>
      <p className="font-semibold text-ink">A few details are needed before you can submit</p>
      <ul className="mt-2 space-y-1.5">
        {issues.map((issue) => (
          <li key={issue.key}>
            <Link to={hrefFor(issue)} className="group inline-flex items-center gap-1.5 font-medium text-ink underline-offset-4 hover:underline">
              {issue.label}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Notice>
  );
}

/* ── Compact status, for the dashboard ──────────────────────────────────── */

export function VerificationSummary({ listing }: { listing: PortalListing }) {
  const meta = VERIFICATION_META[listing.verification];
  const cta =
    listing.verification === 'draft'
      ? { to: `/business/onboarding?listing=${listing.id}`, label: 'Continue setup' }
      : listing.verification === 'rejected'
        ? { to: '/business/verification', label: 'See the note and resubmit' }
        : { to: '/business/verification', label: 'View status' };
  return (
    <div>
      <VerificationBadge status={listing.verification} />
      <p className="mt-3 text-sm text-ink-2">{meta.summary}</p>
      {listing.verification === 'rejected' && listing.verificationNote && <p className="mt-2 line-clamp-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-ink">{listing.verificationNote}</p>}
      <Link to={cta.to} className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
        {cta.label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

/* ── Submission form ────────────────────────────────────────────────────── */

interface VerificationFormProps {
  listing: PortalListing;
  onSubmit: (input: VerificationInput) => Promise<unknown>;
  /** Extra controls placed before the submit button (the wizard's Back). */
  leading?: ReactNode;
}

export function VerificationForm({ listing, onSubmit, leading }: VerificationFormProps) {
  const resubmitting = listing.verification === 'rejected';
  const form = useForm<VerificationInput>({
    resolver: zodResolver(verificationSchema),
    defaultValues: { proofType: listing.verificationRequest?.proofType, note: '', doc: undefined },
  });
  const { errors, isSubmitting } = form.formState;
  const proofType = useWatch({ control: form.control, name: 'proofType' });
  const note = useWatch({ control: form.control, name: 'note' });
  const doc = useWatch({ control: form.control, name: 'doc' });
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  const attach = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateImage(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setReading(true);
    try {
      // Larger than listing photos so the text on the document stays readable.
      form.setValue('doc', await compressImage(file, 1500, 0.78), { shouldDirty: true });
    } catch {
      toast.error('That file could not be read as an image. Try a photo or a screenshot of the document.');
    } finally {
      setReading(false);
    }
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch {
      /* reported by the caller */
    }
  });

  return (
    <form onSubmit={submit} noValidate className="@container space-y-6">
      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-ink-2">Which document can you provide?</legend>
        <div role="group" aria-label="Proof document" className="grid gap-2.5 @lg:grid-cols-2">
          {PROOF_TYPES.map((p) => {
            const active = proofType === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => form.setValue('proofType', p.id, { shouldDirty: true, shouldValidate: true })}
                className={cn(
                  'flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-[border-color,background-color,transform] active:scale-[0.99]',
                  active ? 'border-forest bg-surface shadow-card' : 'border-line bg-surface hover:border-line-2 hover:bg-surface-2',
                )}
              >
                <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', active ? 'border-forest' : 'border-line-2')} aria-hidden>
                  {active && <span className="size-2.5 rounded-full bg-forest" />}
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-ink">{p.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-muted-2">{p.description}</span>
                </span>
              </button>
            );
          })}
        </div>
        <FieldError>{errors.proofType?.message}</FieldError>
      </fieldset>

      <div>
        <p className="mb-2 text-[13px] font-medium text-ink-2">
          Photo of the document <span className="font-normal text-muted">(optional, but it speeds things up)</span>
        </p>
        {doc ? (
          <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-3">
            <img src={doc} alt="The document you attached" className="size-20 shrink-0 rounded-xl border border-line object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">Document attached</p>
              <p className="text-[13px] text-muted-2">Check that the name and address are readable.</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => form.setValue('doc', undefined, { shouldDirty: true })} className="text-danger hover:bg-danger-soft hover:text-danger">
              <Trash2 /> Remove
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line-2 bg-surface-2 p-4">
            <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()} loading={reading}>
              {!reading && <FileUp />} {listing.verificationDoc ? 'Replace the document on file' : 'Attach a photo'}
            </Button>
            <p className="min-w-0 flex-1 text-[13px] text-muted-2">
              {listing.verificationDoc ? 'The document from your last request is still on file and will be sent again.' : 'JPG, PNG or WebP, up to 5 MB. A clear phone photo is fine.'}
            </p>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void attach(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-muted-2">
          <Lock className="mt-px size-3.5 shrink-0" aria-hidden /> Only NearMe reviewers see this document. It never appears on your public listing.
        </p>
      </div>

      <div>
        <div className="flex items-end justify-between">
          <Label htmlFor="verification-note">Anything the reviewer should know? (optional)</Label>
          <span className="mb-1.5">
            <CharCount value={note} max={300} />
          </span>
        </div>
        <Textarea
          id="verification-note"
          rows={3}
          aria-invalid={Boolean(errors.note)}
          placeholder={resubmitting ? 'Say what you changed since the last review.' : 'For example: the licence is in my partner’s name, or we moved to this address last month.'}
          className="min-h-[84px]"
          {...form.register('note')}
        />
        <FieldError>{errors.note?.message}</FieldError>
      </div>

      <div className="rounded-2xl bg-sage/50 p-4">
        <p className="text-sm font-semibold text-ink">What happens next</p>
        <ol className="mt-2 space-y-1.5 text-sm text-ink-2">
          <li>1. Your request joins the review queue and the status changes to Submitted.</li>
          <li>2. A reviewer compares your listing with the document. You can keep editing your listing meanwhile.</li>
          <li>3. If approved, the Verified badge appears and offers and live updates unlock. If not, you get a note explaining why and can resubmit.</li>
        </ol>
      </div>

      {!hasBackend && (
        <Notice icon={HardDrive}>
          <span className="font-medium text-ink">Local mode.</span> No server is connected, so this request is stored on this device and is reviewed from the admin area on this device.
        </Notice>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line pt-4">
        <div>{leading}</div>
        <Button type="submit" loading={isSubmitting} disabled={reading}>
          {resubmitting ? 'Resubmit for verification' : 'Submit for verification'}
        </Button>
      </div>
    </form>
  );
}
