import { useQueryClient } from '@tanstack/react-query';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/common/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { TONES } from '@/data/categories';
import { useCollections } from '@/hooks/useSaved';
import { cn } from '@/lib/utils';
import { savedService } from '@/services/saved';
import type { Place } from '@/types';

/** Add a place to one or more collections, or start a new collection on the spot. */
export function CollectionPicker({ place, open, onOpenChange }: { place: Place; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const { data: collections = [] } = useCollections();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['collections'] });
    void qc.invalidateQueries({ queryKey: ['saved'] });
  };

  const toggle = async (id: string, label: string) => {
    try {
      const added = await savedService.toggleInCollection(id, place);
      refresh();
      toast(added ? `Added to ${label}` : `Removed from ${label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the collection.');
    }
  };

  const create = async () => {
    setError('');
    try {
      const col = await savedService.createCollection({ name });
      await savedService.toggleInCollection(col.id, place);
      refresh();
      setName('');
      setCreating(false);
      toast.success(`Created “${col.name}”`);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\[.*?"message":\s*"(.*?)".*$/s, '$1') : 'Could not create the collection.');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add to a collection" description={place.name} size="sm">
      <ul className="space-y-1.5">
        {collections.map((c) => {
          const has = c.placeIds.includes(place.id);
          return (
            <li key={c.id}>
              <button type="button" onClick={() => toggle(c.id, c.name)} aria-pressed={has} className={cn('flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors', has ? 'border-forest bg-bg-2' : 'border-line hover:bg-surface-2')}>
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', TONES[c.tone].soft)}>
                  <Icon name={c.icon} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-ink">{c.name}</span>
                  <span className="tabular block text-[12.5px] text-muted-2">
                    {c.placeIds.length} place{c.placeIds.length === 1 ? '' : 's'}
                  </span>
                </span>
                <span className={cn('grid size-6 place-items-center rounded-full border', has ? 'border-forest bg-forest text-on-forest' : 'border-line-2')}>{has && <Check className="size-3.5" />}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {creating ? (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label htmlFor="new-collection" className="mb-1.5 block text-[13px] font-medium text-ink-2">
            Collection name
          </label>
          <div className="flex gap-2">
            <Input id="new-collection" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Date night" autoFocus maxLength={40} aria-invalid={Boolean(error)} />
            <Button type="submit" disabled={name.trim().length < 2}>
              Create
            </Button>
          </div>
          {error && <p role="alert" className="mt-1.5 text-[13px] text-danger">{error}</p>}
        </form>
      ) : (
        <Button variant="secondary" className="mt-4 w-full" onClick={() => setCreating(true)}>
          <Plus /> New collection
        </Button>
      )}
    </Sheet>
  );
}
