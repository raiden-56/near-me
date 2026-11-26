import { useQueryClient } from '@tanstack/react-query';
import { EllipsisVertical, FolderOpen, Map as MapIcon, Pencil, Share2, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Icon } from '@/components/common/Icon';
import { Page, PageHeader } from '@/components/common/layout-bits';
import { EmptyState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuTrigger, Segmented, Skeleton } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/sheet';
import { TONES } from '@/data/categories';
import { CompactPlaceCard } from '@/features/businesses/components/PlaceCards';
import { MapView } from '@/features/maps/components/MapView';
import { useCollections, useSavedPlaces } from '@/hooks/useSaved';
import { distanceMeters } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { savedService } from '@/services/saved';
import { useLocation } from '@/store/location';
import { CollectionForm } from './SavedPage';

export default function CollectionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const here = useLocation((s) => s.coords);
  const collections = useCollections();
  const saved = useSavedPlaces();
  const [view, setView] = useState<'list' | 'map'>('list');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const collection = collections.data?.find((c) => c.id === id);
  const places = useMemo(() => {
    if (!collection || !saved.data) return [];
    return collection.placeIds
      .map((pid) => saved.data.find((s) => s.placeId === pid)?.place)
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ ...p, distance: distanceMeters(here, p) }));
  }, [collection, saved.data, here]);

  if (collections.isPending || saved.isPending)
    return (
      <Page>
        <Skeleton className="mt-8 h-10 w-1/2" />
        <Skeleton className="mt-6 h-[104px] w-full rounded-2xl" />
      </Page>
    );

  if (!collection)
    return (
      <Page>
        <EmptyState icon={FolderOpen} title="Collection not found" description="It may have been deleted." action={<Button asChild><Link to="/saved">Back to Saved</Link></Button>} />
      </Page>
    );

  const tone = TONES[collection.tone];

  const share = async () => {
    const text = savedService.shareText(collection, places);
    try {
      if (navigator.share) await navigator.share({ title: collection.name, text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success('Collection copied', { description: 'Paste it into any chat or note.' });
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error('Could not share this collection.');
    }
  };

  const remove = async (placeId: string, name: string) => {
    const place = places.find((p) => p.id === placeId);
    if (!place) return;
    await savedService.toggleInCollection(collection.id, place);
    void qc.invalidateQueries({ queryKey: ['collections'] });
    toast(`Removed ${name} from ${collection.name}`);
  };

  const destroy = async () => {
    await savedService.deleteCollection(collection.id);
    void qc.invalidateQueries({ queryKey: ['collections'] });
    toast('Collection deleted', { description: 'The places are still in your saved list.' });
    navigate('/saved');
  };

  return (
    <Page>
      <PageHeader
        back="/saved"
        title={collection.name}
        subtitle={collection.description ?? `${places.length} place${places.length === 1 ? '' : 's'}`}
        actions={
          <>
            <Button variant="secondary" onClick={share} disabled={!places.length}>
              <Share2 /> <span className="hidden sm:inline">Share</span>
            </Button>
            <Menu>
              <MenuTrigger className="grid size-11 place-items-center rounded-xl border border-line-2 bg-surface text-ink hover:bg-surface-2" aria-label="Collection options">
                <EllipsisVertical className="size-[18px]" />
              </MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => setEditing(true)}>
                  <Pencil /> Rename or restyle
                </MenuItem>
                <MenuItem destructive onSelect={() => setDeleting(true)}>
                  <Trash2 /> Delete collection
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />

      <div className="mb-5 flex items-center gap-3">
        <span className={cn('grid size-12 place-items-center rounded-2xl', tone.soft)}>
          <Icon name={collection.icon} className="size-6" />
        </span>
        <p className="tabular flex-1 text-sm text-muted-2">
          {places.length} place{places.length === 1 ? '' : 's'}
        </p>
        {places.length > 0 && <Segmented aria-label="View" size="sm" value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map', icon: <MapIcon /> }]} />}
      </div>

      {places.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="This collection is empty"
          description="Open any place, tap the menu and choose “Add to collection”."
          action={
            <Button asChild>
              <Link to="/">Explore places</Link>
            </Button>
          }
        />
      ) : view === 'map' ? (
        <div className="h-[460px] overflow-hidden rounded-3xl border border-line lg:h-[560px]">
          <MapView center={places[0]!} zoom={13} places={places} selectedId={selected} onSelect={(pid) => (pid && pid === selected ? navigate(`/place/${pid}`) : setSelected(pid))} label={`Map of ${collection.name}`} />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {places.map((p) => (
            <CompactPlaceCard
              key={p.id}
              place={p}
              trailing={
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    void remove(p.id, p.name);
                  }}
                  aria-label={`Remove ${p.name} from this collection`}
                  className="grid size-9 shrink-0 place-items-center self-center rounded-full text-muted-2 hover:bg-bg-2 hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              }
            />
          ))}
        </div>
      )}

      <CollectionForm key={collection.updatedAt} open={editing} onOpenChange={setEditing} existing={collection} />
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={`Delete “${collection.name}”?`} description="The collection is removed. The places in it stay in your saved list." confirmLabel="Delete" destructive onConfirm={destroy} />
    </Page>
  );
}
