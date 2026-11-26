import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, CircleSlash, ImagePlus, LayoutGrid, MapPinPlus, MessageSquareText, Pencil, Radio, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Icon } from '@/components/common/Icon';
import { Page, PageHeader } from '@/components/common/layout-bits';
import { Notice } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { browsableGroups, CATEGORY_BY_ID, categoriesIn } from '@/data/categories';
import { MapView } from '@/features/maps/components/MapView';
import { usePlace } from '@/hooks/usePlaces';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { compressImage, validateImage } from '@/lib/schemas';
import { cn } from '@/lib/utils';
import { contributeService } from '@/services/contribute';
import { useLocation } from '@/store/location';
import { useUi } from '@/store/ui';
import type { PlaceSuggestion } from '@/types';

type Kind = PlaceSuggestion['kind'];

const KINDS: { id: Kind; title: string; hint: string; icon: typeof MapPinPlus; needsPlace?: boolean }[] = [
  { id: 'add', title: 'Add a place', hint: 'A business or spot that is not on NearMe yet', icon: MapPinPlus },
  { id: 'edit', title: 'Suggest an edit', hint: 'Fix a name, hours, phone or location', icon: Pencil, needsPlace: true },
  { id: 'photo', title: 'Upload photos', hint: 'Show others what a place looks like', icon: Camera, needsPlace: true },
  { id: 'closed', title: 'Report a closed business', hint: 'It has shut down or moved away', icon: CircleSlash, needsPlace: true },
  { id: 'missing', title: 'Report a missing place', hint: 'You searched and could not find it', icon: Search },
  { id: 'category', title: 'Suggest a category', hint: 'A kind of place we should list', icon: LayoutGrid },
];

const LABELS: Record<Kind, { name: string; details: string; placeholder: string; submit: string }> = {
  add: { name: 'Name of the place', details: 'What is it, and how do people find it?', placeholder: 'Opening hours, phone, landmark, anything that helps a moderator check it.', submit: 'Submit place' },
  edit: { name: 'Place', details: 'What should change?', placeholder: 'For example: “Open till 11 pm on weekends”, “Phone number is now 080 …”.', submit: 'Send suggestion' },
  photo: { name: 'Place', details: 'Describe the photos', placeholder: 'What do the photos show, and when were they taken?', submit: 'Upload photos' },
  closed: { name: 'Place', details: 'What happened?', placeholder: 'For example: “Shutters down for two months, signboard removed.”', submit: 'Report closure' },
  missing: { name: 'What were you looking for?', details: 'Where is it?', placeholder: 'Street, landmark or area, and what kind of place it is.', submit: 'Report missing place' },
  category: { name: 'Category name', details: 'Why would it be useful?', placeholder: 'What kind of places belong in it? Give an example or two.', submit: 'Suggest category' },
};

export default function ContributePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const openReport = useUi((s) => s.openReport);
  const here = useLocation((s) => s.coords);
  const area = useLocation((s) => s.area);

  const kind = KINDS.find((k) => k.id === params.get('kind'))?.id ?? null;
  const placeId = params.get('place') ?? undefined;
  const { place } = usePlace(placeId);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(params.get('category') ?? '');
  const [details, setDetails] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [point, setPoint] = useState(here);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (place) {
      setName(place.name);
      setCategoryId(place.categoryId);
      setPoint({ lat: place.lat, lon: place.lon });
    }
  }, [place]);

  const choose = (k: Kind | null) => {
    const next = new URLSearchParams(params);
    if (k) next.set('kind', k);
    else next.delete('kind');
    setParams(next);
    setErrors({});
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const next = [...photos];
    for (const file of Array.from(files)) {
      if (next.length >= 4) break;
      const problem = validateImage(file);
      if (problem) {
        toast.error(`${file.name}: ${problem}`);
        continue;
      }
      next.push(await compressImage(file));
    }
    setPhotos(next);
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = () => {
    if (!kind) return;
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = 'Enter a name.';
    if (details.trim().length < 10) errs.details = 'Add a little more detail (at least 10 characters).';
    if (kind === 'add' && !categoryId) errs.category = 'Choose the closest category.';
    if (kind === 'photo' && photos.length === 0) errs.photos = 'Add at least one photo.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    requireAuth('Sign in so your contribution can be credited and verified.', async (user) => {
      setBusy(true);
      try {
        await contributeService.submit(user, { kind, name, details, categoryId: categoryId || undefined, placeId, lat: point.lat, lon: point.lon, photos: photos.length ? photos : undefined });
        void qc.invalidateQueries({ queryKey: ['contributions'] });
        toast.success('Thank you', { description: 'Your contribution is waiting for review. You will earn points once it is verified.' });
        navigate('/profile/contributions');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not send your contribution.');
      } finally {
        setBusy(false);
      }
    });
  };

  /* ── Chooser ─────────────────────────────────────────────────────── */
  if (!kind) {
    return (
      <Page className="max-w-[900px]">
        <PageHeader title="Contribute to NearMe" subtitle="Local knowledge makes the map better for everyone. Verified contributions earn points towards your level." />
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => openReport(place ?? undefined)} className="flex items-center gap-4 rounded-2xl bg-forest p-4 text-left text-on-forest transition-opacity hover:opacity-92 sm:col-span-2">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/12">
              <Radio className="size-6" />
            </span>
            <span>
              <span className="block text-[16px] font-semibold">Share a live update</span>
              <span className="block text-sm opacity-80">Queues, waiting times, availability, traffic, closures. Takes three taps.</span>
            </span>
          </button>
          {KINDS.map((k) => (
            <button key={k.id} type="button" onClick={() => (k.needsPlace && !placeId ? navigate(`/search`) : choose(k.id))} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-left transition-[border-color,box-shadow] hover:border-line-2 hover:shadow-card">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-bg-2 text-ink">
                <k.icon className="size-6" strokeWidth={1.6} />
              </span>
              <span className="min-w-0">
                <span className="block text-[16px] font-semibold text-ink">{k.title}</span>
                <span className="block text-sm text-muted-2">{k.needsPlace && !placeId ? 'Find the place first, then use its menu' : k.hint}</span>
              </span>
            </button>
          ))}
          <Link to="/search" className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition-[border-color,box-shadow] hover:border-line-2 hover:shadow-card sm:col-span-2">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-bg-2 text-ink">
              <MessageSquareText className="size-6" strokeWidth={1.6} />
            </span>
            <span>
              <span className="block text-[16px] font-semibold text-ink">Write a review</span>
              <span className="block text-sm text-muted-2">Search for a place you have visited and rate it</span>
            </span>
          </Link>
        </div>
        <Notice className="mt-6">Contributions are reviewed before they appear. Spam and repeated submissions earn nothing and reduce your reputation.</Notice>
      </Page>
    );
  }

  /* ── Form ────────────────────────────────────────────────────────── */
  const meta = KINDS.find((k) => k.id === kind)!;
  const labels = LABELS[kind];
  const locked = Boolean(place) && meta.needsPlace;

  return (
    <Page className="max-w-[760px]">
      <PageHeader title={meta.title} subtitle={meta.hint} back={false} />
      <button type="button" onClick={() => (placeId ? navigate(`/place/${placeId}`) : choose(null))} className="-mt-3 mb-5 flex items-center gap-1.5 text-[13px] font-medium text-muted-2 hover:text-ink">
        <ArrowLeft className="size-4" /> {placeId ? 'Back to the place' : 'Choose something else'}
      </button>

      <div className="space-y-5">
        {locked && place ? (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-bg-2 text-ink-2">
              <Icon name={CATEGORY_BY_ID[place.categoryId]?.icon ?? 'MapPin'} className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-ink">{place.name}</span>
              <span className="block text-[13px] text-muted-2">{CATEGORY_BY_ID[place.categoryId]?.singular}</span>
            </span>
          </div>
        ) : (
          <Field label={labels.name} htmlFor="c-name" error={errors.name}>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-invalid={Boolean(errors.name)} />
          </Field>
        )}

        {(kind === 'add' || kind === 'missing') && (
          <Field label="Category" htmlFor="c-cat" error={errors.category}>
            <Select id="c-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-invalid={Boolean(errors.category)}>
              <option value="">Choose a category</option>
              {browsableGroups.map((g) => (
                <optgroup key={g.id} label={g.label}>
                  {categoriesIn(g.id).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        )}

        {kind === 'add' && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-2">Where is it?</p>
            <div className="relative h-56 overflow-hidden rounded-2xl border border-line">
              <MapView center={point} zoom={16} places={[]} onUserMove={(c) => setPoint(c)} label="Move the map to position the place" />
              {/* Fixed crosshair: the user moves the map under it. */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
                <div className="grid size-9 place-items-center rounded-full bg-brand text-white shadow-float">
                  <MapPinPlus className="size-[18px]" />
                </div>
                <div className="mx-auto h-2.5 w-0.5 bg-brand" />
              </div>
            </div>
            <p className="tabular mt-1.5 text-[12.5px] text-muted-2">
              Move the map so the pin sits on the place. Starting from {area}. ({point.lat.toFixed(5)}, {point.lon.toFixed(5)})
            </p>
          </div>
        )}

        <Field label={labels.details} htmlFor="c-details" error={errors.details}>
          <Textarea id="c-details" value={details} onChange={(e) => setDetails(e.target.value.slice(0, 600))} placeholder={labels.placeholder} className="min-h-32" aria-invalid={Boolean(errors.details)} />
          <p className="tabular mt-1 text-right text-[12px] text-muted">{details.length}/600</p>
        </Field>

        {(kind === 'photo' || kind === 'add') && (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">
              Photos {kind === 'add' && <span className="font-normal text-muted">(optional)</span>} <span className="font-normal text-muted">· up to 4, 5 MB each</span>
            </p>
            <div className="flex flex-wrap gap-2.5">
              {photos.map((src, i) => (
                <div key={i} className="relative size-24 overflow-hidden rounded-xl">
                  <img src={src} alt={`Selected photo ${i + 1}`} className="size-full object-cover" />
                  <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`} className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {photos.length < 4 && (
                <button type="button" onClick={() => fileRef.current?.click()} className={cn('grid size-24 place-items-center rounded-xl border border-dashed text-muted-2 transition-colors hover:border-muted hover:text-ink', errors.photos ? 'border-danger' : 'border-line-2')}>
                  <ImagePlus className="size-7" strokeWidth={1.5} />
                  <span className="sr-only">Add photos</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
            {errors.photos && <p role="alert" className="mt-1.5 text-[13px] text-danger">{errors.photos}</p>}
          </div>
        )}

        <Button size="lg" className="w-full sm:w-auto" onClick={submit} loading={busy}>
          {labels.submit}
        </Button>
        <p className="text-[12.5px] text-muted-2">A moderator checks contributions before they change what others see. Nothing is published automatically.</p>
      </div>
    </Page>
  );
}
