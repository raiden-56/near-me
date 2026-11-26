import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium select-none transition-[background-color,border-color,color,opacity,transform,box-shadow] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-forest text-on-forest hover:opacity-90',
        brand: 'bg-brand text-white hover:bg-brand-strong',
        secondary: 'border border-line-2 bg-surface text-ink hover:bg-surface-2',
        soft: 'bg-bg-2 text-ink hover:bg-line',
        ghost: 'text-ink-2 hover:bg-bg-2 hover:text-ink',
        danger: 'bg-danger text-white hover:opacity-90',
        'danger-soft': 'bg-danger-soft text-danger hover:opacity-85',
        link: 'text-brand-ink underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        sm: 'h-9 rounded-[10px] px-3 text-[13px] [&_svg]:size-4',
        md: 'h-11 rounded-xl px-4 text-sm [&_svg]:size-[18px]',
        lg: 'h-[52px] rounded-[14px] px-6 text-[15px] [&_svg]:size-5',
        icon: 'size-10 rounded-xl [&_svg]:size-[18px]',
        'icon-sm': 'size-9 rounded-[10px] [&_svg]:size-4',
        'icon-lg': 'size-12 rounded-[14px] [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ className, variant, size, asChild, loading, disabled, children, type, ...props }: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button type={type ?? 'button'} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <LoaderCircle className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
