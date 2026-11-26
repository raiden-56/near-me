import { useQueryClient } from '@tanstack/react-query';
import { Bookmark, FolderPlus, Map as MapIcon, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Icon } from '@/components/common/Icon';
import { Page, PageHeader, SectionHeader, stagger } from '@/components/common/layout-bits';
import { EmptyState } from '@/components/common/states';
import { Chip } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Segmented, Skeleton } from '@/components/ui/controls';
import { Field, Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { browsableGroups, GROUPS, TONES } from '@/data/categories';
import { CompactPlaceCard } from '@/features/businesses/components/PlaceCards';
import { MapView } from '@/features/maps/components/MapView';
import { useCollections, useSavedPlaces } from '@/hooks/useSaved';
import { distanceMeters } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { COLLECTION_ICONS, COLLECTION_TONES, savedService } from '@/services/saved';
import { useLocation } from '@/store/location';
import type { Collection, GroupId, SavedPlace, Tone } from '@/types';

export function CollectionCard({ collection, places }: { collection: Collection; places: SavedPlace[] }) {
  const tone = TONES[collection.tone];
  const names = collection.placeIds.map((id) => places.find((p) => p.placeId === id)?.place.name).filter(Boolean) as string[];
  return (
    <Link to={`/collections/${collection.id}`} className="group flex h-full flex-col rounded-[22px] border border-line bg-surface p-4 transition-[box-shadow,transform,border-color] hover:-translate-y-0.5 hover:border-line-2 hover:shadow-lift">
      <div className="flex items-start justify-between">
        <span className={cn('grid size-12 place-items-center rounded-2xl', tone.soft)}>
          <Icon name={collection.icon} className="size-6" />
        </span>
        <span className="tabular display text-[28px] leading-none text-line-2 transition-colors group-hover:text-brand">{collection.placeIds.length}</span>
      </div>
      <h3 className="display-sm mt-4 text-[19px] text-ink">{collection.name}</h3>
      <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-2">{names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '') : (collection.description ?? 'Nothing here yet')}</p>
    </Link>
  );
}

export function CollectionForm({ open, onOpenChange, existing }: { open: boolean; onOpenChange: (o: boolean) => void; existing?: Collection }) {
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? 'Heart');
  const [tone, setTone] = useState<Tone>(existing?.tone ?? 'brand');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      if (existing) await savedService.updateCollection(existing.id, { name, description: description.trim() || undefined, icon, tone });
      else await savedService.createCollection({ name, description, icon, tone });
      void qc.invalidateQueries({ queryKey: ['collections'] });
      toast.success(existing ? 'Collection updated' : `Created “${name.trim()}”`);
      onOpenChange(false);
      if (!existing) {
        setName('');
        setDescription('');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      setError(message.startsWith('[') ? 'Give the collection a name between 2 and 40 characters.' : message || 'Could not save the collection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={existing ? 'Edit collection' : 'New collection'} size="sm" footer={<Button className="w-full" onClick={save} loading={busy} disabled={name.trim().length < 2}>{existing ? 'Save changes' : 'Create collection'}</Button>}>
      <div className="space-y-4">
        <Field label="Name" htmlFor="col-name" error={error}>
          <Input id="col-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Sunday breakfasts" autoFocus aria-invalid={Boolean(error)} />
        </Field>
        <Field label="Description (optional)" htmlFor="col-desc">
          <Input id="col-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={120} />
        </Field>
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Icon</p>
          <div className="flex flex-wrap gap-2">
            {COLLECTION_ICONS.map((i) => (
              <button key={i} type="button" onClick={() => setIcon(i)} aria-pressed={icon === i} aria-label={i} className={cn('grid size-11 place-items-center rounded-xl border transition-colors', icon === i ? 'border-forest bg-forest text-on-forest' : 'border-line text-ink-2 hover:bg-surface-2')}>
                <Icon name={i} className="size-5" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Colour</p>
          <div className="flex flex-wrap gap-2.5">
            {COLLECTION_TONES.map((t) => (
              <button key={t} type="button" onClick={() => setTone(t)} aria-pressed={tone === t} aria-label={t} className={cn('size-9 rounded-full border-2 transition-transform', tone === t ? 'scale-110 border-ink' : 'border-transparent')} style={{ backgroundColor: TONES[t].hex }} />
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

type View = 'list' | 'map';

export default function SavedPage() {
  const here = useLocation((s) => s.coords);
  const saved = useSavedPlaces();
  const collections = useCollections();
  const [view, setView] = useState<View>('list');
  const [group, setGroup] = useState<GroupId | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const places = useMemo(() => (saved.data ?? []).map((s) => ({ ...s.place, distance: distanceMeters(here, s.place) })), [saved.data, here]);
  const filtered = group === 'all' ? places : places.filter((p) => p.groupId === group);
  const groupsPresent = browsableGroups.filter((g) => places.some((p) => p.groupId === g.id));
  const loading = saved.isPending || collections.isPending;
  const center = filtered[0] ?? here;

  return (
    <Page>
      <PageHeader
        back={false}
        title="Saved"
        subtitle="Your places and collections. They are kept on this device and open without a connection."
        actions={
          <Button variant="secondary" onClick={() => setCreating(true)}>
            <FolderPlus /> <span className="hidden sm:inline">New collection</span>
          </Button>
        }
      />

      {/* Collections */}
      <section>
        <SectionHeader title="Collections" subtitle="Group places your own way" />
        {loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[164px] rounded-[22px]" />
            ))}
          </div>
        ) : (
          <motion.div variants={stagger.container} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(collections.data ?? []).map((c) => (
              <motion.div key={c.id} variants={stagger.item}>
                <CollectionCard collection={c} places={saved.data ?? []} />
              </motion.div>
            ))}
            <motion.div variants={stagger.item}>
              <button type="button" onClick={() => setCreating(true)} className="flex h-full min-h-[164px] w-full flex-col items-center justify-center gap-2.5 rounded-[22px] border border-dashed border-line-2 text-sm font-medium text-ink-2 transition-colors hover:border-muted hover:text-ink">
                <span className="grid size-11 place-items-center rounded-full bg-bg-2">
                  <Plus className="size-5" />
                </span>
                Custom collection
              </button>
            </motion.div>
          </motion.div>
        )}
      </section>

      {/* Saved places */}
      <section className="mt-12">
        <div className="mb-3.5 flex items-end justify-between gap-3">
          <div>
            <h2 className="display-sm text-[22px] text-ink sm:text-2xl">All saved places</h2>
            <p className="tabular mt-0.5 text-sm text-muted-2">{places.length} saved</p>
          </div>
          {places.length > 0 && (
            <Segmented<View> aria-label="View saved places" size="sm" value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map', icon: <MapIcon /> }]} />
          )}
        </div>

        {groupsPresent.length > 1 && (
          <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            <Chip active={group === 'all'} onClick={() => setGroup('all')}>
              All
            </Chip>
            {groupsPresent.map((g) => (
              <Chip key={g.id} active={group === g.id} onClick={() => setGroup(g.id)}>
                <Icon name={GROUPS.find((x) => x.id === g.id)!.icon} /> {g.label}
              </Chip>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-2xl" />
            ))}
          </div>
        ) : places.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="Nothing saved yet"
            description="Tap the bookmark on any place to keep it here. Saved places stay available offline."
            action={
              <Button asChild>
                <Link to="/">Find places to save</Link>
              </Button>
            }
          />
        ) : view === 'map' ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="h-[420px] overflow-hidden rounded-3xl border border-line lg:h-[520px]">
              <MapView center={center} zoom={13} places={filtered} selectedId={selected} onSelect={setSelected} label="Map of your saved places" />
            </div>
            <div className="space-y-3 lg:max-h-[520px] lg:overflow-y-auto">
              {filtered.map((p) => (
                <div key={p.id} onMouseEnter={() => setSelected(p.id)}>
                  <CompactPlaceCard place={p} active={selected === p.id} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <CompactPlaceCard key={p.id} place={p} />
            ))}
          </div>
        )}
      </section>

      <CollectionForm open={creating} onOpenChange={setCreating} />
    </Page>
  );
}
