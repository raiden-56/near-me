import { BadgeCheck, CircleAlert, Hourglass, PencilLine, Send, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge, SampleTag, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress, Skeleton } from '@/components/ui/controls';
import { cn } from '@/lib/utils';
import type { VerificationStatus } from '@/types';

/** What a form hands to its footer, so the same form can sit in the wizard or on a manage screen. */
export interface FormFooterState {
  submitting: boolean;
  dirty: boolean;
  reset: () => void;
}

export type FormFooter = (state: FormFooterState) => ReactNode;

/* ── Page scaffolding ───────────────────────────────────────────────────── */

export function PortalPage({ title, subtitle, eyebrow, actions, children, className }: { title: string; subtitle?: string; eyebrow?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto w-full max-w-[1120px] px-4 pb-16 sm:px-6 lg:px-10', className)}>
      <header className="flex flex-col gap-4 pb-6 pt-6 sm:flex-row sm:items-end sm:justify-between lg:pt-10">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1.5 text-[13px] font-medium text-brand-ink">{eyebrow}</div>}
          <h1 className="display text-[30px] text-ink sm:text-[36px]">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-muted-2">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function Panel({ id, title, description, action, children, className, bodyClassName }: { id?: string; title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section id={id} className={cn('card scroll-mt-24', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 px-5 pt-5 sm:px-6">
          <div className="min-w-0">
            {title && <h2 className="display-sm text-[20px] text-ink">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted-2">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn('p-5 sm:p-6', (title || action) && 'pt-4 sm:pt-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Rows of placeholders while a panel's data loads. */
export function PanelSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('card space-y-3 p-5 sm:p-6', className)} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-6 w-44" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/* ── Verification ───────────────────────────────────────────────────────── */

export const VERIFICATION_META: Record<VerificationStatus, { label: string; tone: BadgeTone; icon: LucideIcon; summary: string }> = {
  draft: { label: 'Draft', tone: 'neutral', icon: PencilLine, summary: 'Not submitted yet. Only you can see this listing.' },
  submitted: { label: 'Submitted', tone: 'butter', icon: Send, summary: 'Your request is in the queue for a NearMe reviewer.' },
  in_review: { label: 'In review', tone: 'warning', icon: Hourglass, summary: 'A reviewer is checking your details and document.' },
  verified: { label: 'Verified', tone: 'success', icon: BadgeCheck, summary: 'Customers see the verified badge on your listing.' },
  rejected: { label: 'Not approved', tone: 'danger', icon: CircleAlert, summary: 'The reviewer could not approve this request. See their note and resubmit.' },
};

export function VerificationBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  const meta = VERIFICATION_META[status];
  const IconCmp = meta.icon;
  return (
    <Badge tone={meta.tone} className={className}>
      <IconCmp aria-hidden /> {meta.label}
    </Badge>
  );
}

/* ── Forms ──────────────────────────────────────────────────────────────── */

/** Save row for manage screens: quiet until something changes. */
export function SaveBar({ state, label = 'Save changes', className }: { state: FormFooterState; label?: string; className?: string }) {
  return (
    <div className={cn('mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-line pt-4', className)}>
      {state.dirty && <p className="mr-auto text-[13px] text-muted-2">You have unsaved changes.</p>}
      {state.dirty && (
        <Button type="button" variant="ghost" onClick={state.reset} disabled={state.submitting}>
          Discard
        </Button>
      )}
      <Button type="submit" loading={state.submitting} disabled={!state.dirty}>
        {label}
      </Button>
    </div>
  );
}

export function CharCount({ value, max }: { value: string | undefined; max: number }) {
  const length = value?.length ?? 0;
  return <span className={cn('tabular text-[12px]', length > max ? 'text-danger' : 'text-muted')}>{length}/{max}</span>;
}

/* ── Figures ────────────────────────────────────────────────────────────── */

/** A single number with its label. The number is the chart. */
export function StatTile({ label, value, hint, icon: IconCmp, sample, to, className }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; sample?: boolean; to?: string; className?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted-2">{label}</p>
        {IconCmp && <IconCmp className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />}
      </div>
      <p className="mt-2 flex items-baseline gap-2 text-[28px] font-semibold leading-none text-ink">
        {value}
        {sample && <SampleTag className="self-center" />}
      </p>
      {hint && <p className="mt-2 text-[12.5px] text-muted-2">{hint}</p>}
    </>
  );
  const base = 'card block p-4 sm:p-5';
  return to ? (
    <Link to={to} className={cn(base, 'transition-shadow hover:shadow-lift', className)}>
      {body}
    </Link>
  ) : (
    <div className={cn(base, className)}>{body}</div>
  );
}

/** "4 of 6 photos" with a meter. Turns to the warning colour when the plan limit is reached. */
export function LimitMeter({ label, used, limit, className }: { label: string; used: number; limit: number; className?: string }) {
  const full = used >= limit;
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium text-ink-2">{label}</span>
        <span className={cn('tabular', full ? 'font-semibold text-warning' : 'text-muted-2')}>
          {used} of {limit}
        </span>
      </div>
      <Progress value={limit ? used / limit : 0} tone={full ? 'brand' : 'forest'} className="mt-1.5" />
    </div>
  );
}
