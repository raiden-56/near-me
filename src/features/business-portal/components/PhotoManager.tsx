import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2 } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/sheet';
import { compressImage, IMAGE_TYPES, validateImage } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import type { PortalListing } from '@/services/businessPortal';
import { useAddPhotos, useRemovePhoto, useReorderPhotos } from '../hooks';
import { planFor } from '../plans';
import { LimitMeter } from './bits';

/**
 * Upload, order and remove listing photos. Files are checked and compressed in the browser, then
 * handed to the service, which enforces the plan's photo limit. The first photo is the cover.
 * Every change is saved as it happens.
 */
export function PhotoManager({ listing, limitHint = true }: { listing: PortalListing; limitHint?: boolean }) {
  const plan = planFor(listing.plan);
  const limit = plan.limits.photos;
  const photos = listing.photos;
  const room = Math.max(0, limit - photos.length);

  const add = useAddPhotos();
  const remove = useRemovePhoto();
  const reorder = useReorderPhotos();
  const input = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const busy = preparing || add.isPending;

  const upload = async (files: File[]) => {
    if (!files.length || busy) return;
    if (room === 0) {
      toast.error(`The ${plan.name} plan includes ${limit} photos. Remove one, or change plan to add more.`);
      return;
    }
    setPreparing(true);
    const ready: string[] = [];
    let overLimit = 0;
    for (const file of files) {
      if (ready.length >= room) {
        overLimit++;
        continue;
      }
      const problem = validateImage(file);
      if (problem) {
        toast.error(`${file.name}: ${problem}`);
        continue;
      }
      try {
        ready.push(await compressImage(file, 1280, 0.8));
      } catch {
        toast.error(`${file.name} could not be read as an image.`);
      }
    }
    setPreparing(false);
    if (overLimit) toast.warning(`${overLimit} photo${overLimit === 1 ? ' was' : 's were'} left out: the ${plan.name} plan includes ${limit}.`);
    if (ready.length) add.mutate({ id: listing.id, photos: ready });
  };

  const move = (from: number, to: number, message?: string) => {
    const order = photos.map((_, i) => i);
    const [picked] = order.splice(from, 1);
    order.splice(to, 0, picked!);
    reorder.mutate({ id: listing.id, order }, { onSuccess: () => message && toast.success(message) });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void upload([...e.dataTransfer.files]);
  };

  return (
    <div className="@container">
      {limitHint && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <LimitMeter label={`Photos on the ${plan.name} plan`} used={photos.length} limit={limit} className="w-full max-w-xs" />
          {room === 0 && plan.id !== 'pro' && (
            <Link to="/business/subscription" className="text-[13px] font-medium text-brand-ink underline-offset-4 hover:underline">
              See plans with more photos
            </Link>
          )}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center rounded-2xl border border-dashed px-6 py-8 text-center transition-colors',
          dragging ? 'border-brand bg-brand-soft/60' : 'border-line-2 bg-surface-2',
        )}
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-surface text-ink-2 shadow-card">
          <ImagePlus className="size-6" strokeWidth={1.5} aria-hidden />
        </span>
        <p className="mt-3 text-[15px] font-medium text-ink">{room === 0 ? 'You have reached your photo limit' : 'Drop photos here, or choose files'}</p>
        <p className="mt-1 max-w-md text-[13px] text-muted-2">
          JPG, PNG or WebP, up to 5 MB each. Photos are resized on this device before upload, and location data is removed.
        </p>
        <Button type="button" variant="secondary" className="mt-4" onClick={() => input.current?.click()} loading={busy} disabled={room === 0}>
          {busy ? 'Preparing photos' : 'Choose photos'}
        </Button>
        <input
          ref={input}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void upload([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>

      {photos.length > 0 && (
        <ul className="mt-5 grid grid-cols-1 gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
          {photos.map((src, i) => (
            <li key={`${i}-${src.length}-${src.slice(-24)}`} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="relative">
                <img src={src} alt={`Photo ${i + 1} of ${listing.name || 'your business'}`} className="aspect-[4/3] w-full object-cover" loading="lazy" decoding="async" />
                {i === 0 && (
                  <Badge tone="forest" className="absolute left-2 top-2">
                    <Star aria-hidden /> Cover
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-0.5 p-1.5">
                {i > 0 ? (
                  <Button type="button" variant="ghost" size="sm" className="px-2" onClick={() => move(i, 0, 'Cover photo updated')} disabled={reorder.isPending}>
                    <Star /> Set as cover
                  </Button>
                ) : (
                  <span className="px-2 text-[12.5px] text-muted-2">Shown first</span>
                )}
                <span className="ml-auto flex items-center">
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, i - 1)} disabled={i === 0 || reorder.isPending} aria-label={`Move photo ${i + 1} earlier`}>
                    <ArrowLeft />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(i, i + 1)} disabled={i === photos.length - 1 || reorder.isPending} aria-label={`Move photo ${i + 1} later`}>
                    <ArrowRight />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setRemoving(i)} aria-label={`Delete photo ${i + 1}`} className="text-danger hover:bg-danger-soft hover:text-danger">
                    <Trash2 />
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Delete this photo?"
        description="It is removed from your listing straight away. This cannot be undone."
        confirmLabel="Delete photo"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (removing === null) return;
          remove.mutate({ id: listing.id, index: removing }, { onSettled: () => setRemoving(null) });
        }}
      />
    </div>
  );
}
