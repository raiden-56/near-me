import { CloudOff, Info, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { describeError, OfflineError } from '@/lib/http';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ icon: IconCmp, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <div className="relative mb-4 grid size-16 place-items-center rounded-[20px] bg-bg-2 text-muted-2">
        <span className="absolute -right-1.5 -top-1.5 size-4 rounded-full bg-butter" aria-hidden />
        <IconCmp className="size-7" strokeWidth={1.5} aria-hidden />
      </div>
      <h3 className="display-sm text-xl text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-2">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title, className, compact }: { error?: unknown; onRetry?: () => void; title?: string; className?: string; compact?: boolean }) {
  const offline = error instanceof OfflineError || (typeof navigator !== 'undefined' && !navigator.onLine);
  return (
    <div role="alert" className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <div className={cn('mb-4 grid size-16 place-items-center rounded-[20px]', offline ? 'bg-bg-2 text-muted-2' : 'bg-danger-soft text-danger')}>
        {offline ? <CloudOff className="size-7" strokeWidth={1.5} aria-hidden /> : <TriangleAlert className="size-7" strokeWidth={1.5} aria-hidden />}
      </div>
      <h3 className="display-sm text-xl text-ink">{title ?? (offline ? 'You are offline' : 'That did not load')}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-2">{describeError(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}

const NOTICE = {
  info: 'border-line bg-surface-2 text-ink-2',
  sample: 'border-dashed border-line-2 bg-butter-soft/60 text-ink-2',
  warning: 'border-warning/25 bg-warning-soft text-ink',
  danger: 'border-danger/25 bg-danger-soft text-ink',
  success: 'border-success/25 bg-success-soft text-ink',
};

export function Notice({ tone = 'info', icon: IconCmp = Info, children, action, className }: { tone?: keyof typeof NOTICE; icon?: LucideIcon; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed', NOTICE[tone], className)}>
      <IconCmp className="mt-0.5 size-4 shrink-0 opacity-80" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
