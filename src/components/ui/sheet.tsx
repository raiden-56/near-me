import { X } from 'lucide-react';
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'motion/react';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { useIsTablet } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Desktop width. On phones every sheet slides up from the bottom. */
  size?: 'sm' | 'md' | 'lg';
  /** Desktop presentation: centred dialog (default) or a drawer from the right. */
  side?: 'center' | 'right';
  hideTitle?: boolean;
  className?: string;
  bodyClassName?: string;
}

const WIDTH = { sm: 'md:max-w-md', md: 'md:max-w-lg', lg: 'md:max-w-2xl' };
const ease = [0.22, 1, 0.36, 1] as const;

/**
 * One modal surface for the whole app: a draggable bottom sheet on phones, a dialog or side
 * drawer on larger screens. Built on Radix Dialog for focus trapping, Escape and screen readers.
 */
export function Sheet({ open, onOpenChange, title, description, children, footer, size = 'md', side = 'center', hideTitle, className, bodyClassName }: SheetProps) {
  const desktop = useIsTablet();
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const drawer = desktop && side === 'right';

  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : !desktop
      ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
      : drawer
        ? { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } }
        : { initial: { opacity: 0, scale: 0.96, y: 12 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.97, y: 8 } };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[#1b201c]/45 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <div className={cn('pointer-events-none fixed inset-0 z-50 flex', drawer ? 'justify-end' : 'items-end justify-center md:items-center md:p-6')}>
              <Dialog.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
                <motion.div
                  {...motionProps}
                  transition={{ duration: reduce ? 0.12 : 0.34, ease }}
                  drag={!desktop && !reduce ? 'y' : false}
                  dragControls={drag}
                  dragListener={false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.6 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 110 || info.velocity.y > 650) onOpenChange(false);
                  }}
                  className={cn(
                    'pointer-events-auto flex w-full flex-col bg-surface shadow-float outline-none',
                    drawer
                      ? 'h-full max-w-md border-l border-line'
                      : cn('max-h-[92dvh] rounded-t-[26px] md:max-h-[86dvh] md:rounded-3xl md:border md:border-line', WIDTH[size]),
                    className,
                  )}
                >
                  {!desktop && (
                    <div className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-2.5 active:cursor-grabbing" onPointerDown={(e) => drag.start(e)}>
                      <span className="h-1 w-10 rounded-full bg-line-2" />
                    </div>
                  )}
                  <header className={cn('flex shrink-0 items-start gap-3 px-5 pb-3', desktop ? 'pt-5' : 'pt-2', hideTitle && 'sr-only')}>
                    <div className="min-w-0 flex-1">
                      <Dialog.Title className="display-sm text-[21px] text-ink">{title}</Dialog.Title>
                      {description && <Dialog.Description className="mt-1 text-sm text-muted-2">{description}</Dialog.Description>}
                    </div>
                    <Dialog.Close className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-muted-2 transition-colors hover:bg-bg-2 hover:text-ink" aria-label="Close">
                      <X className="size-[18px]" />
                    </Dialog.Close>
                  </header>
                  <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5', !footer && 'pb-safe', bodyClassName)}>{children}</div>
                  {footer && <footer className="shrink-0 border-t border-line bg-surface px-5 pt-3 pb-safe md:rounded-b-3xl md:pb-4">{footer}</footer>}
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** Small confirmation dialog for destructive actions. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirm', destructive, onConfirm, loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description} size="sm">
      <div className="flex gap-2.5 pt-2">
        <button type="button" onClick={() => onOpenChange(false)} className="h-11 flex-1 rounded-xl border border-line-2 bg-surface text-sm font-medium text-ink transition-colors hover:bg-surface-2">
          Cancel
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onConfirm}
          className={cn('h-11 flex-1 rounded-xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50', destructive ? 'bg-danger text-white' : 'bg-forest text-on-forest')}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
