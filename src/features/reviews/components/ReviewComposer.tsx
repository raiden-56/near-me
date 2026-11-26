import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Star, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { aspectsFor } from '@/data/sample/reviews';
import { compressImage, reviewSchema, validateImage } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { saveReview } from '@/services/offlineActions';
import type { Place, Review, UserProfile } from '@/types';

const WORDS = ['', 'Poor', 'Below average', 'Okay', 'Good', 'Excellent'];

export function StarInput({ value, onChange, size = 36, label }: { value: number; onChange: (v: number) => void; size?: number; label: string }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          className="rounded-md p-0.5 transition-transform duration-150 hover:scale-110 active:scale-95"
        >
          <Star style={{ width: size, height: size, color: n <= shown ? '#D9A521' : 'var(--line-2)' }} fill="currentColor" strokeWidth={0} />
        </button>
      ))}
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  place: Place;
  user: UserProfile;
  existing?: Review | null;
}

/** Write or edit a review: overall rating, the dimensions that matter for this kind of place, text and photos. */
export function ReviewComposer({ open, onOpenChange, place, user, existing }: Props) {
  const qc = useQueryClient();
  const aspects = aspectsFor(place.categoryId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rating, setRating] = useState(0);
  const [aspectValues, setAspectValues] = useState<Record<string, number>>({});
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRating(existing?.rating ?? 0);
    setAspectValues(existing?.aspects ?? {});
    setText(existing?.text ?? '');
    setPhotos(existing?.photos ?? []);
    setErrors({});
  }, [open, existing]);

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const next = [...photos];
    for (const file of Array.from(files)) {
      if (next.length >= 4) {
        toast.warning('You can attach up to 4 photos.');
        break;
      }
      const problem = validateImage(file);
      if (problem) {
        toast.error(`${file.name}: ${problem}`);
        continue;
      }
      try {
        next.push(await compressImage(file));
      } catch {
        toast.error(`${file.name} could not be read.`);
      }
    }
    setPhotos(next);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = async () => {
    const parsed = reviewSchema.safeParse({ rating, aspects: aspectValues, text, photos });
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) map[String(issue.path[0])] ??= issue.message;
      setErrors(map);
      return;
    }
    setBusy(true);
    try {
      const result = await saveReview({ user, place, input: parsed.data });
      void qc.invalidateQueries({ queryKey: ['reviews'] });
      void qc.invalidateQueries({ queryKey: ['contributions'] });
      if (result === 'queued') toast('Saved for later', { description: 'You are offline. Your review will be posted when you reconnect.' });
      else toast.success(existing ? 'Review updated' : 'Review posted', { description: existing ? undefined : 'Thanks for helping others decide.' });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your review.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={existing ? 'Edit your review' : 'Write a review'}
      description={place.name}
      size="md"
      footer={
        <Button className="w-full" size="lg" onClick={submit} loading={busy}>
          {existing ? 'Save changes' : 'Post review'}
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-col items-center rounded-2xl bg-bg-2 py-5">
          <StarInput value={rating} onChange={(v) => { setRating(v); setErrors((e) => ({ ...e, rating: '' })); }} label="Overall rating" />
          <p className={cn('mt-2 h-5 text-sm font-medium', rating ? 'text-ink' : 'text-muted-2')}>{rating ? WORDS[rating] : 'Tap to rate'}</p>
          {errors.rating && <p role="alert" className="text-[13px] text-danger">{errors.rating}</p>}
        </div>

        <div>
          <p className="mb-2.5 text-[13px] font-semibold text-ink">
            Rate the details <span className="font-normal text-muted">(optional)</span>
          </p>
          <div className="space-y-2.5">
            {aspects.map((a) => (
              <div key={a} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink-2">{a}</span>
                <StarInput value={aspectValues[a] ?? 0} onChange={(v) => setAspectValues((s) => ({ ...s, [a]: v }))} size={22} label={a} />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="review-text" className="mb-1.5 block text-[13px] font-semibold text-ink">
            Your experience
          </label>
          <Textarea
            id="review-text"
            value={text}
            onChange={(e) => { setText(e.target.value.slice(0, 1500)); setErrors((er) => ({ ...er, text: '' })); }}
            placeholder="What stood out? What should others know before they go?"
            className="min-h-32"
            aria-invalid={Boolean(errors.text)}
          />
          <div className="mt-1 flex justify-between text-[12.5px]">
            <span className="text-danger" role="alert">{errors.text}</span>
            <span className="tabular text-muted">{text.length}/1500</span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">
            Photos <span className="font-normal text-muted">(up to 4, JPG/PNG/WebP, 5 MB each)</span>
          </p>
          <div className="flex flex-wrap gap-2.5">
            {photos.map((src, i) => (
              <div key={i} className="relative size-20 overflow-hidden rounded-xl">
                <img src={src} alt={`Attached photo ${i + 1}`} className="size-full object-cover" />
                <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white">
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {photos.length < 4 && (
              <button type="button" onClick={() => fileRef.current?.click()} className="grid size-20 place-items-center rounded-xl border border-dashed border-line-2 text-muted-2 transition-colors hover:border-muted hover:text-ink">
                <ImagePlus className="size-6" strokeWidth={1.5} />
                <span className="sr-only">Add photos</span>
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
          <p className="mt-2 text-[12.5px] text-muted-2">Photos are resized on your device and location data is removed before they are saved.</p>
        </div>
      </div>
    </Sheet>
  );
}
