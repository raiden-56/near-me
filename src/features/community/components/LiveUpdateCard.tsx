import { BadgeCheck, Check, CircleHelp, Clock, EllipsisVertical, Flag, MapPin, ThumbsUp, Trash2, TriangleAlert, Users, X } from 'lucide-react';
import { memo, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { SampleTag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/controls';
import { Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { useReportActions } from '@/hooks/useCommunity';
import { confidenceLabel, REPORT_TYPE_BY_ID } from '@/lib/community';
import { formatDistance } from '@/lib/geo';
import { timeAgo, timeLeft } from '@/lib/time';
import { cn } from '@/lib/utils';
import { FLAG_REASONS } from '@/services/moderation';
import { useAuth } from '@/store/auth';
import type { CommunityReport, ReportView } from '@/types';

const LEVEL_TILE: Record<CommunityReport['level'], string> = {
  good: 'bg-success-soft text-success',
  moderate: 'bg-warning-soft text-warning',
  bad: 'bg-danger-soft text-danger',
  info: 'bg-bg-2 text-ink-2',
};

export function FreshnessBadge({ report }: { report: ReportView }) {
  if (report.freshness === 'expired')
    return <span className="inline-flex items-center gap-1 rounded-md bg-bg-2 px-1.5 py-0.5 text-[11.5px] font-medium text-muted-2">Expired</span>;
  if (report.freshness === 'live')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-success-soft px-1.5 py-0.5 text-[11.5px] font-semibold text-success">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
        Live
      </span>
    );
  return <span className="inline-flex items-center gap-1 rounded-md bg-butter-soft px-1.5 py-0.5 text-[11.5px] font-medium text-butter-ink">Recently updated</span>;
}

export function VerificationBadge({ report }: { report: ReportView }) {
  switch (report.verification) {
    case 'business_confirmed':
      return (
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-success">
          <BadgeCheck className="size-3.5" aria-hidden /> Business confirmed
        </span>
      );
    case 'community_verified':
      return (
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-sage-ink">
          <Users className="size-3.5" aria-hidden /> Community verified
        </span>
      );
    case 'disputed':
      return (
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-warning">
          <TriangleAlert className="size-3.5" aria-hidden /> Disputed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-2">
          <CircleHelp className="size-3.5" aria-hidden /> Unverified
        </span>
      );
  }
}

/** Four-segment meter: how much weight to give an update, with the reasoning in the tooltip. */
export function ConfidenceMeter({ report, showLabel = true }: { report: ReportView; showLabel?: boolean }) {
  const filled = Math.max(1, Math.round(report.confidence * 4));
  const color = report.confidence >= 0.72 ? 'bg-success' : report.confidence >= 0.45 ? 'bg-warning' : 'bg-muted';
  const label = confidenceLabel(report.confidence);
  return (
    <span className="inline-flex items-center gap-1.5" title={`${label}: based on who reported it, ${report.confirmations.length} confirmation(s), ${report.disagreements.length} disagreement(s) and how recent it is.`}>
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-2.5 w-1 rounded-full', i < filled ? color : 'bg-line-2')} />
        ))}
      </span>
      {showLabel && <span className="text-[12px] text-muted-2">{label}</span>}
    </span>
  );
}

function FlagSheet({ report, open, onOpenChange }: { report: ReportView; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { flag } = useReportActions();
  const [reason, setReason] = useState<string>(FLAG_REASONS[0]);
  const [note, setNote] = useState('');
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Report this update"
      description="Moderators review every report. The person who posted it is not told who reported it."
      size="sm"
      footer={
        <Button
          className="w-full"
          onClick={() => {
            flag(report, reason, note);
            onOpenChange(false);
          }}
        >
          Send report
        </Button>
      }
    >
      <fieldset className="space-y-1.5">
        <legend className="sr-only">Reason</legend>
        {FLAG_REASONS.map((r) => (
          <label key={r} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors', reason === r ? 'border-forest bg-bg-2 font-medium text-ink' : 'border-line text-ink-2 hover:bg-surface-2')}>
            <input type="radio" name="flag-reason" className="size-4 accent-[#E97845]" checked={reason === r} onChange={() => setReason(r)} />
            {r}
          </label>
        ))}
      </fieldset>
      <Textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Anything moderators should know (optional)" className="mt-3 min-h-[72px]" aria-label="Additional details" />
    </Sheet>
  );
}

interface LiveUpdateCardProps {
  report: ReportView;
  /** compact = teaser on the home screen and place pages; full = the Live feed. */
  variant?: 'full' | 'compact';
  className?: string;
  showPlace?: boolean;
}

export const LiveUpdateCard = memo(function LiveUpdateCard({ report, variant = 'full', className, showPlace = true }: LiveUpdateCardProps) {
  const user = useAuth((s) => s.user);
  const actions = useReportActions();
  const [flagOpen, setFlagOpen] = useState(false);
  const meta = REPORT_TYPE_BY_ID[report.type];
  const expired = report.freshness === 'expired';
  const mine = user?.id === report.reporterId;
  const confirmed = Boolean(user && report.confirmations.includes(user.id));
  const disagreed = Boolean(user && report.disagreements.includes(user.id));
  const unverified = report.verification === 'unverified' || report.verification === 'disputed';

  const where = (
    <span className="inline-flex min-w-0 items-center gap-1 text-[13px] text-muted-2">
      <MapPin className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{report.placeName ?? report.areaLabel}</span>
      {report.distance != null && <span className="tabular shrink-0">· {formatDistance(report.distance)}</span>}
    </span>
  );

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-start gap-3 rounded-2xl border bg-surface p-3', unverified ? 'border-dashed border-line-2' : 'border-line', expired && 'opacity-60', className)}>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', LEVEL_TILE[report.level])}>
          <Icon name={meta.icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('line-clamp-2 text-[14.5px] leading-snug text-ink', unverified ? 'font-medium' : 'font-semibold')}>{report.title}</p>
          {showPlace && (report.placeId ? <Link to={`/place/${report.placeId}`} className="mt-0.5 flex hover:underline">{where}</Link> : <div className="mt-0.5 flex">{where}</div>)}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <FreshnessBadge report={report} />
            <VerificationBadge report={report} />
            <span className="tabular text-[12px] text-muted">{timeAgo(report.updatedAt)}</span>
            {report.isSample && <SampleTag />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <article className={cn('rounded-2xl border bg-surface p-4 shadow-card', unverified ? 'border-dashed border-line-2 shadow-none' : 'border-line', expired && 'opacity-65', className)}>
      <div className="flex items-start gap-3.5">
        <span className={cn('grid size-12 shrink-0 place-items-center rounded-2xl', LEVEL_TILE[report.level])}>
          <Icon name={meta.icon} className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-muted-2">{meta.label}</p>
              <h3 className={cn('text-[16px] leading-snug text-ink', unverified ? 'font-medium' : 'font-semibold', expired && 'line-through decoration-line-2')}>{report.title}</h3>
            </div>
            <Menu>
              <MenuTrigger className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted-2 hover:bg-bg-2 hover:text-ink" aria-label="More options">
                <EllipsisVertical className="size-[18px]" />
              </MenuTrigger>
              <MenuContent>
                {report.placeId && (
                  <MenuItem asChild>
                    <Link to={`/place/${report.placeId}`}>
                      <MapPin /> View place
                    </Link>
                  </MenuItem>
                )}
                {mine ? (
                  <MenuItem destructive onSelect={() => actions.remove(report)}>
                    <Trash2 /> Remove my update
                  </MenuItem>
                ) : (
                  <MenuItem onSelect={() => setFlagOpen(true)}>
                    <Flag /> Report a problem
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          </div>

          {showPlace && <div className="mt-1 flex">{report.placeId ? <Link to={`/place/${report.placeId}`} className="flex min-w-0 hover:underline">{where}</Link> : where}</div>}
          {report.note && <p className="mt-2 text-sm leading-relaxed text-ink-2">{report.note}</p>}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <FreshnessBadge report={report} />
            <VerificationBadge report={report} />
            <ConfidenceMeter report={report} />
            {report.isSample && <SampleTag />}
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-2">
            <Clock className="size-3.5" aria-hidden />
            <span className="tabular">{timeAgo(report.updatedAt)}</span>
            <span aria-hidden>·</span>
            <span>
              {report.source === 'business' ? 'Posted by the business' : `${mine ? 'You' : report.reporterName} · ${report.reporterLevel}`}
            </span>
            {!expired && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular">{timeLeft(report.expiresAt)}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {!expired && (
        <div className="mt-3.5 flex items-center gap-2 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => actions.confirm(report)}
            disabled={mine}
            aria-pressed={confirmed}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition-colors active:scale-[0.97] disabled:opacity-45',
              confirmed ? 'border-success/40 bg-success-soft text-success' : 'border-line-2 text-ink hover:bg-surface-2',
            )}
          >
            <Check className="size-4" aria-hidden /> {confirmed ? 'Confirmed' : 'Still true'}
            <span className="tabular text-muted-2">{report.confirmations.length || ''}</span>
          </button>
          <button
            type="button"
            onClick={() => actions.disagree(report)}
            disabled={mine}
            aria-pressed={disagreed}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition-colors active:scale-[0.97] disabled:opacity-45',
              disagreed ? 'border-danger/40 bg-danger-soft text-danger' : 'border-line-2 text-ink hover:bg-surface-2',
            )}
          >
            <X className="size-4" aria-hidden /> Not accurate
            <span className="tabular text-muted-2">{report.disagreements.length || ''}</span>
          </button>
          <button
            type="button"
            onClick={() => actions.helpful(report)}
            aria-pressed={Boolean(user && report.helpful.includes(user.id))}
            className={cn('ml-auto flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium transition-colors hover:bg-bg-2', user && report.helpful.includes(user.id) ? 'text-brand-ink' : 'text-muted-2')}
          >
            <ThumbsUp className="size-4" aria-hidden />
            <span className="tabular">{report.helpful.length || 'Helpful'}</span>
          </button>
        </div>
      )}
      <FlagSheet report={report} open={flagOpen} onOpenChange={setFlagOpen} />
    </article>
  );
});
