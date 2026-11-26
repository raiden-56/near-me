import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, CalendarPlus, Clock, MapPin, Share2, Star, Ticket } from 'lucide-react';
import { motion } from 'motion/react';
import { memo, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { z } from 'zod';
import { Icon } from '@/components/common/Icon';
import { Page, PageHeader } from '@/components/common/layout-bits';
import { EmptyState, Notice } from '@/components/common/states';
import { Badge, Chip, SampleTag } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { shareLink } from '@/features/deals/components/DealCard';
import { useEvents } from '@/hooks/useCommunity';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { appUrl } from '@/lib/env';
import { formatDistance } from '@/lib/geo';
import { eventSchema } from '@/lib/schemas';
import { DAY, formatClock } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';
import { EVENT_KINDS, eventsService, type EventView } from '@/services/deals';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import type { EventKind, UserProfile } from '@/types';

const KIND_ICON = Object.fromEntries(EVENT_KINDS.map((k) => [k.id, k.icon])) as Record<EventKind, string>;
type When = 'all' | 'today' | 'weekend' | 'free';

const EventCard = memo(function EventCard({ event, onToggle }: { event: EventView; onToggle: (id: string) => void }) {
  const start = new Date(event.startsAt);
  const live = Date.now() >= event.startsAt && Date.now() < event.endsAt;
  const count = event.interested.length + (event.going ? 1 : 0);
  return (
    <article className="card flex gap-4 p-4">
      <div className="flex w-[62px] shrink-0 flex-col items-center justify-center rounded-2xl bg-bg-2 py-2.5 text-center">
        <span className="text-[12px] font-semibold text-brand-ink">{start.toLocaleDateString('en-IN', { month: 'short' })}</span>
        <span className="display tabular text-[28px] leading-none text-ink">{start.getDate()}</span>
        <span className="mt-0.5 text-[11.5px] text-muted-2">{start.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="sage">
            <Icon name={KIND_ICON[event.kind]} /> {EVENT_KINDS.find((k) => k.id === event.kind)?.label}
          </Badge>
          {live && <Badge tone="success">Happening now</Badge>}
          {event.moderation === 'pending' && <Badge tone="warning">Awaiting review</Badge>}
          {event.isSample && <SampleTag />}
        </div>
        <h3 className="mt-1.5 text-[16px] font-semibold leading-snug text-ink">{event.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-2">{event.description}</p>
        <dl className="mt-2.5 space-y-1 text-[13px] text-muted-2">
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Time</dt>
            <dd className="tabular">
              {formatClock(event.startsAt)} to {formatClock(event.endsAt)}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Venue</dt>
            <dd className="min-w-0 truncate">
              {event.placeId ? (
                <Link to={`/place/${event.placeId}`} className="font-medium text-ink-2 hover:underline">
                  {event.venueName}
                </Link>
              ) : (
                event.venueName
              )}{' '}
              · {formatDistance(event.distance)}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Ticket className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Price</dt>
            <dd>{event.price}</dd>
          </div>
        </dl>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggle(event.id)}
            aria-pressed={event.going}
            className={cn('flex h-9 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition-colors active:scale-[0.97]', event.going ? 'border-brand/40 bg-brand-soft text-brand-ink' : 'border-line-2 text-ink hover:bg-surface-2')}
          >
            <Star className="size-4" fill={event.going ? 'currentColor' : 'none'} aria-hidden /> {event.going ? 'Interested' : "I'm interested"}
            {count > 0 && <span className="tabular text-muted-2">· {count}</span>}
          </button>
          <button
            type="button"
            onClick={() => shareLink({ title: event.title, text: `${event.title} at ${event.venueName}`, url: appUrl('/events') })}
            aria-label="Share event"
            className="grid size-9 place-items-center rounded-[10px] text-muted-2 hover:bg-bg-2 hover:text-ink"
          >
            <Share2 className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
});

type EventForm = z.input<typeof eventSchema>;

function SubmitEventSheet({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: UserProfile | null }) {
  const qc = useQueryClient();
  const coords = useLocation((s) => s.coords);
  const needsApproval = useLocalDb((s) => s.config.eventsRequireApproval);
  const { register, handleSubmit, reset, formState } = useForm<EventForm>({
    resolver: zodResolver(eventSchema) as never,
    defaultValues: { title: '', description: '', kind: 'community', venueName: '', date: new Date(Date.now() + DAY).toISOString().slice(0, 10), startTime: '18:00', endTime: '20:00', price: 'Free' },
  });
  const e = formState.errors;

  const submit = handleSubmit(async (values) => {
    if (!user) return;
    try {
      await eventsService.submit(user, values, coords);
      void qc.invalidateQueries({ queryKey: ['events'] });
      void qc.invalidateQueries({ queryKey: ['contributions'] });
      toast.success(needsApproval ? 'Event sent for review' : 'Event published', { description: needsApproval ? 'It will appear for everyone once a moderator approves it.' : undefined });
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit the event.');
    }
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Submit a local event"
      description="Markets, performances, meetups, classes: anything open to the neighbourhood."
      size="md"
      footer={
        <Button className="w-full" size="lg" onClick={submit} loading={formState.isSubmitting}>
          Submit event
        </Button>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Event name" htmlFor="ev-title" error={e.title?.message}>
          <Input id="ev-title" aria-invalid={Boolean(e.title)} {...register('title')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" htmlFor="ev-kind" error={e.kind?.message}>
            <Select id="ev-kind" {...register('kind')}>
              {EVENT_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Venue" htmlFor="ev-venue" error={e.venueName?.message}>
            <Input id="ev-venue" placeholder="Where is it?" aria-invalid={Boolean(e.venueName)} {...register('venueName')} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date" htmlFor="ev-date" error={e.date?.message}>
            <Input id="ev-date" type="date" min={new Date().toISOString().slice(0, 10)} {...register('date')} />
          </Field>
          <Field label="Starts" htmlFor="ev-start" error={e.startTime?.message}>
            <Input id="ev-start" type="time" {...register('startTime')} />
          </Field>
          <Field label="Ends" htmlFor="ev-end" error={e.endTime?.message}>
            <Input id="ev-end" type="time" aria-invalid={Boolean(e.endTime)} {...register('endTime')} />
          </Field>
        </div>
        <Field label="Entry" htmlFor="ev-price" hint="For example: Free, ₹200, or ₹500 per team" error={e.price?.message}>
          <Input id="ev-price" {...register('price')} />
        </Field>
        <Field label="What should people know?" htmlFor="ev-desc" error={e.description?.message}>
          <Textarea id="ev-desc" aria-invalid={Boolean(e.description)} {...register('description')} />
        </Field>
        <p className="text-[12.5px] text-muted-2">The event is placed around your current area, not at your exact position.</p>
      </form>
    </Sheet>
  );
}

const dayKey = (ts: number) => new Date(ts).toDateString();
const dayLabel = (ts: number) => {
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  if (d.toDateString() === new Date(Date.now() + DAY).toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
};

export default function EventsPage() {
  const area = useLocation((s) => s.area);
  const sample = useSettings((s) => s.sampleData);
  const requireAuth = useRequireAuth();
  const { events, isLoading, toggleInterested } = useEvents();
  const [kind, setKind] = useState<EventKind | 'all'>('all');
  const [when, setWhen] = useState<When>('all');
  const [submitting, setSubmitting] = useState<UserProfile | null>(null);

  const kinds = useMemo(() => EVENT_KINDS.filter((k) => events.some((e) => e.kind === k.id)), [events]);
  const groups = useMemo(() => {
    const today = new Date().toDateString();
    const list = events.filter((e) => {
      if (kind !== 'all' && e.kind !== kind) return false;
      const d = new Date(e.startsAt);
      if (when === 'today') return d.toDateString() === today || (e.startsAt < Date.now() && e.endsAt > Date.now());
      if (when === 'weekend') return d.getDay() === 0 || d.getDay() === 6;
      if (when === 'free') return /free|no cover/i.test(e.price);
      return true;
    });
    const out = new Map<string, EventView[]>();
    for (const e of list) out.set(dayKey(e.startsAt), [...(out.get(dayKey(e.startsAt)) ?? []), e]);
    return [...out.values()];
  }, [events, kind, when]);

  return (
    <Page>
      <PageHeader
        back={false}
        eyebrow="Local events"
        title={`What's on around ${area}`}
        subtitle="Markets, music, sport and meetups within a few kilometres over the coming days."
        actions={
          <Button onClick={() => requireAuth('Sign in to submit an event for your neighbourhood.', (u) => setSubmitting(u))}>
            <CalendarPlus /> <span className="hidden sm:inline">Submit an event</span>
            <span className="sm:hidden">Add</span>
          </Button>
        }
      />

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0">
        {(
          [
            ['all', 'Any time'],
            ['today', 'Today'],
            ['weekend', 'This weekend'],
            ['free', 'Free entry'],
          ] as [When, string][]
        ).map(([id, label]) => (
          <Chip key={id} active={when === id} onClick={() => setWhen(id)}>
            {label}
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-6 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0">
        <Chip active={kind === 'all'} onClick={() => setKind('all')}>
          All types
        </Chip>
        {kinds.map((k) => (
          <Chip key={k.id} active={kind === k.id} onClick={() => setKind(kind === k.id ? 'all' : k.id)}>
            <Icon name={k.icon} /> {k.label}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3.5 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[190px] rounded-2xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No events found"
          description={events.length ? 'Nothing matches these filters. Try another day or type.' : 'Nothing is listed nearby yet. Know of something happening? Add it for your neighbours.'}
          action={
            events.length ? (
              <Button variant="secondary" onClick={() => { setKind('all'); setWhen('all'); }}>
                Clear filters
              </Button>
            ) : (
              <Button onClick={() => requireAuth('Sign in to submit an event.', (u) => setSubmitting(u))}>Submit an event</Button>
            )
          }
        />
      ) : (
        <div className="space-y-9">
          {groups.map((list) => (
            <section key={dayKey(list[0]!.startsAt)}>
              <h2 className="display-sm mb-3 text-xl text-ink">{dayLabel(list[0]!.startsAt)}</h2>
              <div className="grid gap-3.5 lg:grid-cols-2">
                {list.map((e, i) => (
                  <motion.div key={e.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: Math.min(i, 4) * 0.04 }}>
                    <EventCard event={e} onToggle={toggleInterested} />
                  </motion.div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {sample && <Notice tone="sample" className="mt-10">Events tagged “Sample” are example listings at real nearby venues. They are not real events.</Notice>}

      <SubmitEventSheet open={Boolean(submitting)} onOpenChange={(o) => !o && setSubmitting(null)} user={submitting} />
    </Page>
  );
}
