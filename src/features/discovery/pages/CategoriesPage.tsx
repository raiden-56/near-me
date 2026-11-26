import { Search, SearchX } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { Page, PageHeader, stagger } from '@/components/common/layout-bits';
import { EmptyState } from '@/components/common/states';
import { Input } from '@/components/ui/field';
import { browsableGroups, categoriesIn, TONES } from '@/data/categories';
import { useNearbyPlaces } from '@/hooks/usePlaces';
import { formatRadius } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';
import { useLocation } from '@/store/location';

export default function CategoriesPage() {
  const [q, setQ] = useState('');
  const radius = useLocation((s) => s.radius);
  const area = useLocation((s) => s.area);
  const disabled = useLocalDb((s) => s.config.disabledCategoryIds);
  const { places, isLoading } = useNearbyPlaces();

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of places) for (const id of p.categoryIds) out[id] = (out[id] ?? 0) + 1;
    return out;
  }, [places]);

  const term = q.trim().toLowerCase();
  const groups = useMemo(
    () =>
      browsableGroups
        .map((g) => ({
          group: g,
          categories: categoriesIn(g.id).filter((c) => !disabled.includes(c.id) && (!term || c.label.toLowerCase().includes(term) || c.keywords.some((k) => k.includes(term)))),
        }))
        .filter((g) => g.categories.length > 0),
    [term, disabled],
  );

  return (
    <Page>
      <PageHeader title="All categories" subtitle={`Everything you can find around ${area}. Counts are places within ${formatRadius(radius)}.`} back="/" />

      <div className="relative mb-8 max-w-md">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a category, e.g. puncture, chemist" aria-label="Filter categories" className="h-12 pl-11" />
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={SearchX} title={`No category matches “${q}”`} description="Try a simpler word, or search for the place by name instead." action={<Link to={`/search?q=${encodeURIComponent(q)}`} className="text-sm font-semibold text-brand-ink hover:underline">Search for “{q}”</Link>} />
      ) : (
        <div className="space-y-10">
          {groups.map(({ group, categories }) => {
            const tone = TONES[group.tone];
            return (
              <section key={group.id} aria-labelledby={`group-${group.id}`}>
                <div className="mb-4 flex items-center gap-3">
                  <span className={cn('grid size-11 place-items-center rounded-2xl', tone.soft)}>
                    <Icon name={group.icon} className="size-5" />
                  </span>
                  <div>
                    <h2 id={`group-${group.id}`} className="display-sm text-[22px] text-ink">
                      {group.label}
                    </h2>
                    <p className="text-[13px] text-muted-2">{group.blurb}</p>
                  </div>
                </div>
                <motion.ul variants={stagger.container} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-40px' }} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {categories.map((c) => (
                    <motion.li key={c.id} variants={stagger.item}>
                      <Link to={`/category/${c.id}`} className="group flex h-full items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-line-2 hover:shadow-card">
                        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone.soft)}>
                          <Icon name={c.icon} className="size-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold leading-tight text-ink">{c.label}</span>
                          <span className="tabular block text-[12.5px] text-muted-2">{isLoading ? '…' : counts[c.id] ? `${counts[c.id]} nearby` : 'None mapped nearby'}</span>
                        </span>
                      </Link>
                    </motion.li>
                  ))}
                </motion.ul>
              </section>
            );
          })}
        </div>
      )}
    </Page>
  );
}
