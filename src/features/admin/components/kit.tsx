import { ArrowUpRight, EllipsisVertical, Search, X, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ErrorState } from '@/components/common/states';
import { Badge, SampleTag, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Segmented, Skeleton } from '@/components/ui/controls';
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { ModerationState, PlanId, Role, UserProfile, VerificationStatus } from '@/types';
import { useSampleBaseline } from '../hooks';

const num = (n: number) => n.toLocaleString('en-IN');

/* ── Page scaffolding ───────────────────────────────────────────────────── */

export function AdminPage({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pb-16 sm:px-6 lg:px-10">
      <header className="flex flex-col gap-4 pb-6 pt-6 sm:flex-row sm:items-end sm:justify-between lg:pt-10">
        <div className="min-w-0">
          <h1 className="display text-[30px] text-ink sm:text-[36px]">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-muted-2">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

interface PanelProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** The figures in this panel include the sample baseline. */
  sample?: boolean;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({ title, subtitle, action, sample, children, className, bodyClassName }: PanelProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn('card flex flex-col', className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 id={id} className="display-sm flex flex-wrap items-center gap-x-2 gap-y-1 text-[19px] text-ink">
            {title}
            {sample && <SampleTag />}
          </h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted-2">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={cn('flex-1 p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

interface QueryLike<T> {
  data: T | undefined;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/** Loading and failure handling shared by every admin screen. */
export function QueryState<T>({ query, skeleton, children }: { query: QueryLike<T>; skeleton?: ReactNode; children: (data: T) => ReactNode }) {
  if (query.data === undefined) {
    if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} className="card" />;
    return <>{skeleton ?? <TableSkeleton />}</>;
  }
  return <>{children(query.data)}</>;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-line" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="size-9 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-6 w-20 sm:block" />
        </div>
      ))}
    </div>
  );
}

/* ── Sample baseline ────────────────────────────────────────────────────── */

/** Lets an admin drop the sample baseline and see real figures only. Hidden when sample data is off. */
export function BaselineToggle() {
  const { available, on, setOn } = useSampleBaseline();
  if (!available) return null;
  return (
    <Segmented
      size="sm"
      aria-label="Figures shown"
      value={on ? 'sample' : 'real'}
      onChange={(v) => setOn(v === 'sample')}
      options={[
        { value: 'sample', label: 'With sample' },
        { value: 'real', label: 'Real only' },
      ]}
    />
  );
}

/* ── Stat card ──────────────────────────────────────────────────────────── */

interface StatCardProps {
  label: string;
  icon: LucideIcon;
  /** The real count stored on this device (or in the backend). */
  real: number;
  /** Sample baseline added on top. Zero or undefined means the figure is entirely real. */
  sample?: number;
  hint?: string;
  to?: string;
  /** Draws attention when a queue needs work. */
  alert?: boolean;
}

export function StatCard({ label, icon: IconCmp, real, sample = 0, hint, to, alert }: StatCardProps) {
  const withSample = sample > 0;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={cn('grid size-9 place-items-center rounded-xl', alert && real > 0 ? 'bg-brand-soft text-brand-ink' : 'bg-bg-2 text-ink-2')}>
          <IconCmp className="size-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        {withSample ? <SampleTag /> : to ? <ArrowUpRight className="size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden /> : null}
      </div>
      <p className="mt-3.5 text-[13px] text-muted-2">{label}</p>
      <p className="mt-0.5 text-[26px] font-semibold leading-tight tracking-tight text-ink">{num(real + sample)}</p>
      <p className="mt-1 min-h-[18px] text-[12px] text-muted-2">{withSample ? `${num(real)} real · ${num(sample)} sample` : hint}</p>
    </>
  );
  const className = 'card group block p-4 text-left';
  return to ? (
    <Link to={to} className={cn(className, 'transition-shadow hover:shadow-lift')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/* ── Toolbar ────────────────────────────────────────────────────────────── */

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mb-4 grid grid-cols-2 gap-2.5 md:flex md:flex-wrap md:items-center', className)}>{children}</div>;
}

export function SearchField({ value, onChange, placeholder, label, className }: { value: string; onChange: (value: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <div className={cn('relative col-span-2 min-w-0 md:w-[300px]', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} className="h-10 pl-10 pr-9 text-sm [&::-webkit-search-cancel-button]:hidden" />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-2 hover:bg-bg-2 hover:text-ink">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect<T extends string>({ label, value, onChange, options, className }: { label: string; value: T; onChange: (value: T) => void; options: readonly { value: T; label: string }[]; className?: string }) {
  return (
    <div className={cn('min-w-0 md:w-auto md:min-w-[164px]', className)}>
      <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className="h-10 text-sm">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/* ── Data table ─────────────────────────────────────────────────────────── */

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Hide the header text visually (row action columns). */
  srOnlyHeader?: boolean;
  align?: 'left' | 'right';
  className?: string;
}

interface DataTableProps<T> {
  caption: string;
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T) => string;
  /** Stacked presentation for small screens, where a wide table would not fit. */
  card: (row: T) => ReactNode;
  empty: ReactNode;
  pageSize?: number;
  /** Shown in the footer: "12 listings". */
  noun: [one: string, many: string];
  /** The table sits inside another card, so it drops its own shadow. */
  embedded?: boolean;
}

/** A semantic table inside a card with a sticky header on larger screens; stacked cards on phones. */
export function DataTable<T>({ caption, rows, columns, rowKey, card, empty, pageSize = 30, noun, embedded }: DataTableProps<T>) {
  const [limit, setLimit] = useState(pageSize);
  const frame = embedded ? 'rounded-xl border border-line' : 'card';

  if (!rows.length) return <div className={frame}>{empty}</div>;
  const visible = rows.slice(0, limit);

  return (
    <div className={cn(frame, 'overflow-hidden')}>
      <div className="hidden md:block md:max-h-[calc(100dvh-13rem)] md:overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-sm [&_tbody_tr:last-child_td]:border-b-0">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={cn(
                    'sticky top-0 z-10 whitespace-nowrap border-b border-line bg-surface-2 px-3.5 py-3 text-[12.5px] font-medium text-muted-2 first:pl-5 last:pr-5',
                    c.align === 'right' && 'text-right',
                  )}
                >
                  {c.srOnlyHeader ? <span className="sr-only">{c.header}</span> : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-surface-2/70">
                {columns.map((c) => (
                  <td key={c.id} className={cn('border-b border-line px-3.5 py-3 align-middle first:pl-5 last:pr-5', c.align === 'right' && 'text-right', c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-line md:hidden" aria-label={caption}>
        {visible.map((row) => (
          <li key={rowKey(row)} className="p-4">
            {card(row)}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/60 px-5 py-2.5 text-[12.5px] text-muted-2">
        <span className="tabular">
          {rows.length > visible.length ? `Showing ${num(visible.length)} of ${num(rows.length)} ${noun[1]}` : `${num(rows.length)} ${rows.length === 1 ? noun[0] : noun[1]}`}
        </span>
        {rows.length > visible.length && (
          <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + pageSize)}>
            Show more
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Row actions ────────────────────────────────────────────────────────── */

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onSelect?: () => void;
  /** Navigate instead of running a handler. */
  to?: string;
  destructive?: boolean;
  disabled?: boolean;
  separated?: boolean;
}

export function RowMenu({ label, actions, className }: { label: string; actions: readonly (RowAction | false | null | undefined)[]; className?: string }) {
  const items = actions.filter((a): a is RowAction => Boolean(a));
  if (!items.length) return null;
  return (
    <Menu>
      <MenuTrigger aria-label={label} className={cn('grid size-9 shrink-0 place-items-center rounded-[10px] text-muted-2 transition-colors hover:bg-bg-2 hover:text-ink data-[state=open]:bg-bg-2 data-[state=open]:text-ink', className)}>
        <EllipsisVertical className="size-[18px]" aria-hidden />
      </MenuTrigger>
      <MenuContent>
        {items.map((a) => (
          <div key={a.label}>
            {a.separated && <MenuSeparator />}
            {a.to ? (
              <MenuItem asChild>
                <Link to={a.to}>
                  <a.icon strokeWidth={1.75} aria-hidden /> {a.label}
                </Link>
              </MenuItem>
            ) : (
              <MenuItem destructive={a.destructive} disabled={a.disabled} onSelect={a.onSelect} className="data-[disabled]:pointer-events-none data-[disabled]:opacity-45">
                <a.icon strokeWidth={1.75} aria-hidden /> {a.label}
              </MenuItem>
            )}
          </div>
        ))}
      </MenuContent>
    </Menu>
  );
}

/* ── Status badges ──────────────────────────────────────────────────────── */

export const VERIFICATION_META: Record<VerificationStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'butter' },
  in_review: { label: 'In review', tone: 'warning' },
  verified: { label: 'Verified', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const meta = VERIFICATION_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

const MODERATION_META: Record<ModerationState, { label: string; tone: BadgeTone }> = {
  visible: { label: 'Visible', tone: 'success' },
  pending: { label: 'Pending', tone: 'warning' },
  hidden: { label: 'Hidden', tone: 'danger' },
};

export function ModerationBadge({ state }: { state: ModerationState }) {
  const meta = MODERATION_META[state];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export const PLAN_META: Record<PlanId, { label: string; tone: BadgeTone }> = {
  free: { label: 'Free', tone: 'neutral' },
  plus: { label: 'Plus', tone: 'sage' },
  pro: { label: 'Pro', tone: 'forest' },
};

export function PlanBadge({ plan }: { plan: PlanId }) {
  const meta = PLAN_META[plan];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export const ROLE_LABEL: Record<Role, string> = { user: 'Member', business: 'Business', admin: 'Administrator' };

export function RoleBadge({ role }: { role: Role }) {
  return <Badge tone={role === 'admin' ? 'forest' : role === 'business' ? 'clay' : 'neutral'}>{ROLE_LABEL[role]}</Badge>;
}

export function UserStatusBadge({ status }: { status: UserProfile['status'] }) {
  return status === 'suspended' ? <Badge tone="danger">Suspended</Badge> : <Badge tone="success">Active</Badge>;
}

/* ── Note dialog ────────────────────────────────────────────────────────── */

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  minLength?: number;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: (note: string) => void;
}

/** Asks for a written reason before a decision that the affected person will read. */
export function NoteDialog({ open, onOpenChange, title, description, label, placeholder, initialValue = '', minLength = 5, confirmLabel, destructive, loading, onConfirm }: NoteDialogProps) {
  const id = useId();
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setTouched(false);
    }
  }, [open, initialValue]);

  const tooShort = value.trim().length < minLength;
  const error = touched && tooShort ? `Write at least ${minLength} characters.` : undefined;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <div className="flex gap-2.5">
          <Button variant="secondary" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            className="flex-1"
            loading={loading}
            onClick={() => {
              setTouched(true);
              if (!tooShort) onConfirm(value.trim());
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 500))}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-help`}
        className="min-h-[104px]"
      />
      <div id={`${id}-help`}>
        <FieldError>{error}</FieldError>
        {!error && <p className="tabular mt-1.5 text-[12px] text-muted">{value.length} / 500</p>}
      </div>
    </Sheet>
  );
}

/* ── Small pieces ───────────────────────────────────────────────────────── */

/** Label and value pair used in detail panels. */
export function Detail({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[12.5px] text-muted-2">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}

/** A row with a title, explanation and a control on the right: used for on/off settings. */
export function SettingRow({ title, description, control, htmlFor }: { title: string; description: string; control: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
          {title}
        </label>
        <p className="mt-0.5 text-[13px] text-muted-2">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

export const formatCount = num;
