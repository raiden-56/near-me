import { motion } from 'motion/react';
import { DropdownMenu, Slider as SliderPrimitive, Switch as SwitchPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn, initials } from '@/lib/utils';

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full bg-line-2 transition-colors duration-200 data-[state=checked]:bg-success disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[20px] translate-x-[3px] rounded-full bg-white shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-[23px]" />
    </SwitchPrimitive.Root>
  );
}

export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={cn('relative flex h-6 w-full touch-none items-center select-none', className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-line">
        <SliderPrimitive.Range className="absolute h-full bg-brand" />
      </SliderPrimitive.Track>
      {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
        <SliderPrimitive.Thumb key={i} aria-label={props['aria-label']} className="block size-[22px] rounded-full border-[3px] border-brand bg-white shadow-card transition-transform hover:scale-110 focus-visible:outline-offset-4" />
      ))}
    </SliderPrimitive.Root>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}

/** Segmented control with a sliding indicator. */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md', ...rest }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div role="tablist" aria-label={rest['aria-label']} className={cn('inline-flex rounded-xl bg-bg-2 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 font-medium transition-colors duration-150 [&_svg]:size-4',
              size === 'sm' ? 'h-8 text-[13px]' : 'h-9 text-sm',
              active ? 'text-ink' : 'text-muted-2 hover:text-ink',
            )}
          >
            {active && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-[9px] bg-surface shadow-card" transition={{ type: 'spring', stiffness: 480, damping: 38 }} />}
            <span className="relative z-10 flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: string; count?: number }[];
  className?: string;
}

/** Underlined tabs for in-page sections. */
export function Tabs<T extends string>({ value, onChange, tabs, className }: TabsProps<T>) {
  const id = useId();
  return (
    <div role="tablist" className={cn('no-scrollbar flex gap-5 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn('relative shrink-0 pb-3 pt-1 text-sm font-medium transition-colors', active ? 'text-ink' : 'text-muted-2 hover:text-ink')}
          >
            {t.label}
            {t.count != null && <span className="tabular ml-1.5 text-[12px] text-muted">{t.count}</span>}
            {active && <motion.span layoutId={`tab-${id}`} className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" transition={{ type: 'spring', stiffness: 480, damping: 38 }} />}
          </button>
        );
      })}
    </div>
  );
}

export function Progress({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'success' | 'forest' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-line', className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-500 ease-out', tone === 'brand' ? 'bg-brand' : tone === 'success' ? 'bg-success' : 'bg-forest')} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function Avatar({ name, hue = 24, size = 40, className }: { name: string; hue?: number; size?: number; className?: string }) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `oklch(0.62 0.11 ${hue})` }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/* ── Dropdown menu ──────────────────────────────────────────────────────── */

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;

export function MenuContent({ className, children, align = 'end', ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align={align}
        sideOffset={6}
        className={cn('z-[60] min-w-44 rounded-xl border border-line bg-surface p-1 shadow-float outline-none data-[state=open]:animate-in', className)}
        {...props}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, destructive, ...props }: ComponentProps<typeof DropdownMenu.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-bg-2 [&_svg]:size-4',
        destructive ? 'text-danger' : 'text-ink',
        className,
      )}
      {...props}
    />
  );
}

export const MenuSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-line" />;
