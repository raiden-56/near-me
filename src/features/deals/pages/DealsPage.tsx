import { BadgePercent, Megaphone } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { Page, PageHeader } from '@/components/common/layout-bits';
import { EmptyState, Notice } from '@/components/common/states';
import { Chip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Segmented, Skeleton } from '@/components/ui/controls';
import { browsableGroups } from '@/data/categories';
import { RADIUS_OPTIONS } from '@/features/discovery/components/LocationPicker';
import { useDeals } from '@/hooks/useCommunity';
import { formatRadius } from '@/lib/geo';
import { useLocation } from '@/store/location';
import { useSettings } from '@/store/settings';
import type { GroupId } from '@/types';
import { DealCard } from '../components/DealCard';

type Tab = 'all' | 'saved';
type Sort = 'near' | 'ending';

export default function DealsPage() {
  const area = useLocation((s) => s.area);
  const sample = useSettings((s) => s.sampleData);
  const { deals, isLoading, toggleSave } = useDeals();
  const [tab, setTab] = useState<Tab>('all');
  const [group, setGroup] = useState<GroupId | 'all'>('all');
  const [radius, setRadius] = useState(5000);
  const [sort, setSort] = useState<Sort>('near');

  const groupsWithDeals = useMemo(() => browsableGroups.filter((g) => deals.some((d) => d.groupId === g.id)), [deals]);

  const { organic, promoted } = useMemo(() => {
    const list = deals
      .filter((d) => (tab === 'saved' ? d.saved : true) && (group === 'all' || d.groupId === group) && d.distance <= radius)
      .sort((a, b) => (sort === 'near' ? a.distance - b.distance : a.endsAt - b.endsAt));
    return { organic: list.filter((d) => !d.promoted), promoted: list.filter((d) => d.promoted) };
  }, [deals, tab, group, radius, sort]);
  const total = organic.length + promoted.length;
  const savedCount = deals.filter((d) => d.saved).length;

  return (
    <Page>
      <PageHeader back={false} eyebrow="Local deals" title={`Offers around ${area}`} subtitle="Discounts, happy hours and limited-time offers published by nearby businesses." />

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Segmented<Tab> aria-label="Which deals" value={tab} onChange={setTab} options={[{ value: 'all', label: 'All deals' }, { value: 'saved', label: `Saved${savedCount ? ` · ${savedCount}` : ''}` }]} />
        <Segmented<Sort> aria-label="Sort deals" size="sm" value={sort} onChange={setSort} className="ml-auto" options={[{ value: 'near', label: 'Nearest' }, { value: 'ending', label: 'Ending soon' }]} />
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:px-0">
        <Chip active={group === 'all'} onClick={() => setGroup('all')}>
          All categories
        </Chip>
        {groupsWithDeals.map((g) => (
          <Chip key={g.id} active={group === g.id} onClick={() => setGroup(group === g.id ? 'all' : g.id)}>
            <Icon name={g.icon} /> {g.label}
          </Chip>
        ))}
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-5 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {RADIUS_OPTIONS.slice(1).map((r) => (
          <Chip key={r} active={radius === r} onClick={() => setRadius(r)}>
            Within {formatRadius(r)}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-2xl" />
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyState
          icon={BadgePercent}
          title={tab === 'saved' ? 'No saved deals yet' : 'No deals match right now'}
          description={tab === 'saved' ? 'Tap the bookmark on any offer to keep it here until it expires.' : `Nothing within ${formatRadius(radius)} for this category. Try a wider distance.`}
          action={
            tab === 'saved' ? (
              <Button onClick={() => setTab('all')}>Browse deals</Button>
            ) : (
              <Button onClick={() => { setGroup('all'); setRadius(10000); }}>Show everything nearby</Button>
            )
          }
        />
      ) : (
        <div className="space-y-9">
          {promoted.length > 0 && (
            <section aria-labelledby="promoted-heading">
              <h2 id="promoted-heading" className="mb-1 flex items-center gap-2 text-[15px] font-semibold text-ink">
                <Megaphone className="size-4 text-butter-ink" aria-hidden /> Promoted
              </h2>
              <p className="mb-3 text-[13px] text-muted-2">Businesses paid to feature these offers. They are kept separate from the regular list.</p>
              <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {promoted.map((d) => (
                  <DealCard key={d.id} deal={d} onToggleSave={toggleSave} />
                ))}
              </div>
            </section>
          )}

          {organic.length > 0 && (
            <section aria-labelledby="deals-heading">
              <h2 id="deals-heading" className="mb-3 text-[15px] font-semibold text-ink">
                {sort === 'near' ? 'Closest to you' : 'Ending soonest'} <span className="tabular font-normal text-muted-2">· {organic.length}</span>
              </h2>
              <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                {organic.map((d, i) => (
                  <motion.div key={d.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.03 }}>
                    <DealCard deal={d} onToggleSave={toggleSave} className="h-full" />
                  </motion.div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <div className="mt-10 grid gap-3 lg:grid-cols-2">
        {sample && <Notice tone="sample">Deals tagged “Sample” are example offers attached to real nearby places. They are not real promotions.</Notice>}
        <Notice>
          Own a business here?{' '}
          <Link to="/business" className="font-medium text-ink underline underline-offset-2">
            Publish your own offers
          </Link>{' '}
          from the business portal.
        </Notice>
      </div>
    </Page>
  );
}
