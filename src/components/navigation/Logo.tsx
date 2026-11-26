import { cn } from '@/lib/utils';

/** The NearMe mark: you (the dot) and everything around you (the orbit). */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9.5" fill="#252B26" />
      <circle cx="16" cy="16" r="3.5" fill="#E97845" />
      <path d="M8.2 16A7.8 7.8 0 0 1 16 8.2" stroke="#F5F3ED" strokeWidth="2.1" strokeLinecap="round" fill="none" />
      <path d="M23.8 16A7.8 7.8 0 0 1 16 23.8" stroke="#F5F3ED" strokeWidth="2.1" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} />
      <span className="display text-[22px] font-semibold tracking-tight text-ink">
        Near<span className="text-brand">Me</span>
      </span>
    </span>
  );
}
