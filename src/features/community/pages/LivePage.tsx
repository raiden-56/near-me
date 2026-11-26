import { Plus, Radio, ShieldCheck, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { Page, PageHeader } from '@/components/common/layout-bits';
import { EmptyState, Notice } from '@/components/common/states';
import { Chip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { RADIUS_OPTIONS } from '@/features/discovery/components/LocationPicker';
import { useLiveFeed, useTick } from '@/hooks/useCommunity';
import { REPORT_TYPES } from '@/lib/community';
import { formatRadius } from '@/lib/geo';
import { formatClock } from '@/lib/time';
import { useLocalDb } from '@/services/backend/localDb';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import { useUi } from '@/store/ui';
import type { ReportType, ReportView } from '@/types';
import { LiveUpdateCard } from '../components/LiveUpdateCard';

type Trust = 'all' | 'verified' | 'unverified';

const TOPICS: { id: string; label: string; icon: string; types: ReportType[] }[] = [
  { id: 'queues', label: 'Queues and waits', icon: 'Hourglass', types: ['queue', 'wait_time'] },
  { id: 'available', label: 'Availability', icon: 'CircleCheck', types: ['availability', 'service', 'closure'] },
  { id: 'roads', label: 'Traffic and roads', icon: 'TrafficCone', types: ['traffic', 'road'] },
  { id: 'parking', label: 'Parking', icon: 'SquareParking', types: ['parking'] },
  { id: 'outages', label: 'Power and water', icon: 'ZapOff', types: ['outage'] },
  { id: 'events', label: 'Events', icon: 'PartyPopper', types: ['event'] },
  { id: 'prices', label: 'Prices', icon: 'IndianRupee', types: ['price'] },
];

export default function LivePage() {
  const area = useLocation((s) => s.area);
  const preferredRadius = useLocation((s) => s.radius);
  const sample = useSettings((s) => s.sampleData);
  const online = useUi((s) => s.online);
  const openReport = useUi((s) => s.openReport);
  const expiry = useLocalDb((s) => s.config.expiryMinutes);
  const minConfirm = useLocalDb((s) => s.config.minConfirmationsForVerified);
  const [radius, setRadius] = useState(Math.max(2000, preferredRadius));
  const [topic, setTopic] = useState<string>('all');
  const [trust, setTrust] = useState<Trust>('all');
  const tick = useTick(30_000);

  const feed = useLiveFeed({ radius, includeExpired: true });
  const types = TOPICS.find((t) => t.id === topic)?.types;

  const { current, expired, counts } = useMemo(() => {
    const inRange = feed.reports.filter((r) => (r.distance ?? 0) <= radius);
    const byTopic: Record<string, number> = { all: 0 };
    for (const r of inRange) {
      if (r.freshness === 'expired') continue;
      byTopic.all = (byTopic.all ?? 0) + 1;
      const t = TOPICS.find((x) => x.types.includes(r.type));
      if (t) byTopic[t.id] = (byTopic[t.id] ?? 0) + 1;
    }
    const match = (r: ReportView) =>
      (!types || types.includes(r.type)) &&
      (trust === 'all' || (trust === 'verified' ? r.verification === 'business_confirmed' || r.verification === 'community_verified' : r.verification === 'unverified' || r.verification === 'disputed'));
    const list = inRange.filter(match);
    return { current: list.filter((r) => r.freshness !== 'expired'), expired: list.filter((r) => r.freshness === 'expired'), counts: byTopic };
  }, [feed.reports, radius, types, trust]);

  const verifiedCount = current.filter((r) => r.verification !== 'unverified' && r.verification !== 'disputed').length;

  return (
    <Page>
      <PageHeader
        back={false}
        eyebrow="NearMe Live"
        title={`Happening around ${area}`}
        subtitle="Short-lived updates from neighbours and businesses. Each one expires on its own, so what you see is current."
        actions={
          <Button variant="brand" onClick={() => openReport()} className="hidden sm:flex">
            <Plus /> Share an update
          </Button>
        }
      />

      {!online && (
        <Notice tone="warning" className="mb-4">
          You are offline. Live updates cannot refresh, so nothing here should be treated as current.
        </Notice>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <div className="min-w-0">
          {/* Filters */}
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0">
            <Chip active={topic === 'all'} onClick={() => setTopic('all')}>
              All <span className="tabular opacity-70">{counts.all ?? 0}</span>
            </Chip>
            {TOPICS.map((t) => (
              <Chip key={t.id} active={topic === t.id} onClick={() => setTopic(topic === t.id ? 'all' : t.id)}>
                <Icon name={t.icon} /> {t.label}
                {counts[t.id] ? <span className="tabular opacity-70">{counts[t.id]}</span> : null}
              </Chip>
            ))}
          </div>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            <Chip active={trust === 'verified'} onClick={() => setTrust(trust === 'verified' ? 'all' : 'verified')}>
              <ShieldCheck /> Verified only
            </Chip>
            <Chip active={trust === 'unverified'} onClick={() => setTrust(trust === 'unverified' ? 'all' : 'unverified')}>
              <Users /> Needs confirmation
            </Chip>
            <span className="mx-1 w-px shrink-0 self-stretch bg-line" aria-hidden />
            {RADIUS_OPTIONS.slice(1).map((r) => (
              <Chip key={r} active={radius === r} onClick={() => setRadius(r)}>
                {formatRadius(r)}
              </Chip>
            ))}
          </div>

          <p className="mb-3 flex items-center gap-2 text-[13px] text-muted-2" aria-live="polite">
            <Radio className="size-4 text-success" aria-hidden />
            {feed.isLoading ? 'Checking what is happening…' : `${current.length} current update${current.length === 1 ? '' : 's'}, ${verifiedCount} verified · refreshed ${formatClock(tick * 30_000)}`}
          </p>

          {feed.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[168px] rounded-2xl" />
              ))}
            </div>
          ) : current.length === 0 ? (
            <EmptyState
              icon={Radio}
              title={topic === 'all' && trust === 'all' ? 'All quiet nearby' : 'Nothing matches these filters'}
              description={topic === 'all' && trust === 'all' ? `No current updates within ${formatRadius(radius)}. Spotted a queue, a closure or free parking? Share it and help the next person.` : 'Try another topic or widen the distance.'}
              action={
                <>
                  <Button onClick={() => openReport()}>
                    <Plus /> Share an update
                  </Button>
                  {(topic !== 'all' || trust !== 'all') && (
                    <Button variant="secondary" onClick={() => { setTopic('all'); setTrust('all'); }}>
                      Clear filters
                    </Button>
                  )}
                </>
              }
            />
          ) : (
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {current.map((r) => (
                  <motion.div key={r.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
                    <LiveUpdateCard report={r} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {expired.length > 0 && (
            <section className="mt-10" aria-labelledby="earlier-heading">
              <h2 id="earlier-heading" className="display-sm text-lg text-ink">
                Earlier
              </h2>
              <p className="mb-3 text-[13px] text-muted-2">These have expired and may no longer be true.</p>
              <div className="space-y-3">
                {expired.slice(0, 8).map((r) => (
                  <LiveUpdateCard key={r.id} report={r} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* How it works */}
        <aside className="mt-10 space-y-4 lg:mt-0">
          <div className="rounded-3xl bg-forest p-5 text-on-forest">
            <h2 className="display-sm text-xl">See something? Say something useful.</h2>
            <p className="mt-1.5 text-sm opacity-80">Three taps: what it is about, what you see, post. Your update helps people decide before they go.</p>
            <Button variant="brand" className="mt-4 w-full" onClick={() => openReport()}>
              <Plus /> Share an update
            </Button>
          </div>

          <div className="card p-5">
            <h2 className="text-[15px] font-semibold text-ink">How to read the feed</h2>
            <dl className="mt-3 space-y-3 text-[13px] leading-relaxed text-ink-2">
              <div>
                <dt className="font-semibold text-success">Business confirmed</dt>
                <dd>Posted by the verified business itself.</dd>
              </div>
              <div>
                <dt className="font-semibold text-sage-ink">Community verified</dt>
                <dd>At least {minConfirm} other people nearby confirmed it.</dd>
              </div>
              <div>
                <dt className="font-semibold text-muted-2">Unverified</dt>
                <dd>One person's report, shown with a dashed outline. Treat it as a tip, and confirm it if you can.</dd>
              </div>
              <div>
                <dt className="font-semibold text-warning">Disputed</dt>
                <dd>More people disagreed than agreed. Heavily disputed updates are hidden for review.</dd>
              </div>
            </dl>
          </div>

          <div className="card p-5">
            <h2 className="text-[15px] font-semibold text-ink">How long updates last</h2>
            <ul className="mt-3 space-y-1.5 text-[13px]">
              {REPORT_TYPES.map((t) => (
                <li key={t.type} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-ink-2">
                    <Icon name={t.icon} className="size-4 text-muted-2" /> {t.label}
                  </span>
                  <span className="tabular font-medium text-ink">{expiry[t.type] >= 120 ? `${Math.round(expiry[t.type] / 60)} h` : `${expiry[t.type]} min`}</span>
                </li>
              ))}
            </ul>
          </div>

          {sample && (
            <Notice tone="sample">
              Updates tagged “Sample” are example data so you can see how the feed works. Your own updates are real and stay on this device until a backend is connected.{' '}
              <Link to="/settings" className="font-medium text-ink underline underline-offset-2">
                Turn samples off
              </Link>
            </Notice>
          )}
          <p className="px-1 text-[12.5px] leading-relaxed text-muted-2">For emergencies, do not rely on community updates. Use the <Link to="/emergency" className="font-medium text-ink underline underline-offset-2">Emergency</Link> page or call your local emergency number.</p>
        </aside>
      </div>

      {/* Phone: floating compose button */}
      <button
        type="button"
        onClick={() => openReport()}
        className="fixed bottom-[84px] right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-brand px-5 text-[15px] font-semibold text-white shadow-float transition-transform active:scale-95 sm:hidden"
      >
        <Plus className="size-5" /> Update
      </button>
    </Page>
  );
}
