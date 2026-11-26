import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium leading-5 [&_svg]:size-3', {
  variants: {
    tone: {
      neutral: 'bg-bg-2 text-ink-2',
      brand: 'bg-brand-soft text-brand-ink',
      sage: 'bg-sage text-sage-ink',
      butter: 'bg-butter-soft text-butter-ink',
      clay: 'bg-clay text-clay-ink',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      danger: 'bg-danger-soft text-danger',
      forest: 'bg-forest text-on-forest',
      outline: 'border border-line-2 text-muted-2',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Toggleable filter chip. Rectangular with soft corners: pills are used sparingly in NearMe. */
export function Chip({ active, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3 text-[13px] font-medium transition-colors duration-150 active:scale-[0.97] [&_svg]:size-4',
        active ? 'border-forest bg-forest text-on-forest' : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Marks content generated as sample data, so it is never mistaken for real community input. */
export function SampleTag({ className, label = 'Sample' }: { className?: string; label?: string }) {
  return (
    <span title="Example content. Not a real report or review." className={cn('inline-flex items-center rounded border border-dashed border-line-2 px-1 text-[10.5px] font-medium leading-4 text-muted-2', className)}>
      {label}
    </span>
  );
}
