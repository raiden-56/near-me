import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Clock, MapPin, Search, ShieldCheck, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '@/components/common/Icon';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { CATEGORY_BY_ID } from '@/data/categories';
import { useNearbyPlaces } from '@/hooks/usePlaces';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { REPORT_TYPE_BY_ID, REPORT_TYPES, reportTypesForCategory, type ReportTypeMeta } from '@/lib/community';
import { formatDistance } from '@/lib/geo';
import { cn } from '@/lib/utils';
import { useLocalDb } from '@/services/backend/localDb';
import { ReportLimitError } from '@/services/community';
import { submitReport } from '@/services/offlineActions';
import { useLocation } from '@/store/location';
import { useUi } from '@/store/ui';
import type { CommunityReport, Place, ReportType } from '@/types';

const LEVEL_STYLE: Record<CommunityReport['level'], string> = {
  good: 'border-success/30 bg-success-soft text-success',
  moderate: 'border-warning/30 bg-warning-soft text-warning',
  bad: 'border-danger/30 bg-danger-soft text-danger',
  info: 'border-line-2 bg-bg-2 text-ink-2',
};

function PlacePicker({ onPick, onCancel }: { onPick: (place: Place) => void; onCancel: () => void }) {
  const [q, setQ] = useState('');
  const { places, isLoading } = useNearbyPlaces({ radius: 1500 });
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return places.filter((p) => p.hasName && (!term || p.name.toLowerCase().includes(term))).slice(0, 30);
  }, [places, q]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={onCancel} aria-label="Back" className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-bg-2">
          <ArrowLeft className="size-[18px]" />
        </button>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search places near you" aria-label="Search nearby places" className="pl-9" autoFocus />
        </div>
      </div>
      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-2">Finding places around you…</p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-2">No nearby place matches “{q}”.</p>
      ) : (
        <ul className="max-h-[46dvh] divide-y divide-line overflow-y-auto">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-bg-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-bg-2 text-ink-2">
                  <Icon name={CATEGORY_BY_ID[p.categoryId]?.icon ?? 'MapPin'} className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-ink">{p.name}</span>
                  <span className="block truncate text-[13px] text-muted-2">
                    {CATEGORY_BY_ID[p.categoryId]?.singular} · {formatDistance(p.distance)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Fast report flow: pick what it is about, pick what you see, post. Three taps. */
export function ReportComposer() {
  const { open, place: presetPlace, type: presetType } = useUi((s) => s.reportComposer);
  const close = useUi((s) => s.closeReport);
  const requireAuth = useRequireAuth();
  const qc = useQueryClient();
  const { coords, area, source } = useLocation();
  const expiry = useLocalDb((s) => s.config.expiryMinutes);

  const [type, setType] = useState<ReportType | null>(null);
  const [place, setPlace] = useState<Place | undefined>();
  const [optionIndex, setOptionIndex] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(presetType ?? null);
    setPlace(presetPlace);
    setOptionIndex(null);
    setValue('');
    setNote('');
    setPicking(false);
  }, [open, presetPlace, presetType]);

  const meta: ReportTypeMeta | null = type ? REPORT_TYPE_BY_ID[type] : null;
  const option = meta && optionIndex != null ? meta.options[optionIndex]! : null;

  const orderedTypes = useMemo(() => {
    if (!place) return REPORT_TYPES;
    const preferred = reportTypesForCategory(place.categoryId);
    return [...REPORT_TYPES].sort((a, b) => {
      const ia = preferred.indexOf(a.type);
      const ib = preferred.indexOf(b.type);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [place]);

  const needsPlace = Boolean(meta?.needsPlace) && !place;
  const numeric = value.trim() ? Number(value) : undefined;
  const canPost = Boolean(meta && option && !needsPlace && (numeric === undefined || (Number.isFinite(numeric) && numeric >= 0)));

  const post = () =>
    requireAuth('Sign in to share a live update with people nearby.', async (user) => {
      if (!meta || !option) return;
      setBusy(true);
      try {
        const title = numeric !== undefined && meta.valueUnit ? (meta.type === 'price' ? `Price seen: ₹${numeric}` : `${option.title} (${numeric} ${meta.valueUnit})`) : option.title;
        const result = await submitReport({
          user,
          input: { type: meta.type, title, level: option.level, value: numeric ?? option.value, note: note.trim() || undefined },
          place,
          location: coords,
          areaLabel: area,
        });
        void qc.invalidateQueries({ queryKey: ['live'] });
        void qc.invalidateQueries({ queryKey: ['contributions'] });
        if (result === 'queued') toast('Saved for later', { description: 'You are offline. This update will post when you reconnect, if it is still current.' });
        else toast.success('Update shared', { description: `Visible to people nearby for ${expiry[meta.type]} minutes.` });
        close();
      } catch (e) {
        if (e instanceof ReportLimitError) toast.warning(e.message);
        else toast.error(e instanceof Error ? e.message : 'Could not share your update.');
      } finally {
        setBusy(false);
      }
    });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title={picking ? 'Choose a place' : meta ? meta.label : 'Share a live update'}
      description={picking ? undefined : meta ? meta.prompt : 'Help people nearby make a better decision. What is it about?'}
      size="md"
      footer={
        meta && !picking ? (
          <div className="flex items-center gap-3">
            <p className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] text-muted-2">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">Expires automatically after {expiry[meta.type]} min</span>
            </p>
            <Button variant="brand" onClick={post} disabled={!canPost} loading={busy}>
              Share update
            </Button>
          </div>
        ) : undefined
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {picking ? (
          <motion.div key="pick" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
            <PlacePicker
              onCancel={() => setPicking(false)}
              onPick={(p) => {
                setPlace(p);
                setPicking(false);
              }}
            />
          </motion.div>
        ) : !meta ? (
          <motion.div key="types" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {place && (
              <p className="mb-3 flex items-center gap-2 rounded-xl bg-bg-2 px-3 py-2.5 text-sm text-ink">
                <MapPin className="size-4 shrink-0 text-brand" aria-hidden />
                <span className="truncate">
                  About <span className="font-semibold">{place.name}</span>
                </span>
              </p>
            )}
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {orderedTypes.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => setType(t.type)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface px-2 py-4 text-center transition-[border-color,background-color,transform] hover:border-line-2 hover:bg-surface-2 active:scale-[0.97]"
                >
                  <span className="grid size-11 place-items-center rounded-full bg-bg-2 text-ink">
                    <Icon name={t.icon} className="size-5" />
                  </span>
                  <span className="text-[13px] font-medium leading-tight text-ink">{t.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="details" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} className="space-y-5">
            <button type="button" onClick={() => { setType(null); setOptionIndex(null); }} className="-mt-1 flex items-center gap-1.5 text-[13px] font-medium text-muted-2 hover:text-ink">
              <ArrowLeft className="size-4" /> Change topic
            </button>

            <div className="grid grid-cols-2 gap-2.5">
              {meta.options.map((o, i) => {
                const active = optionIndex === i;
                return (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setOptionIndex(i)}
                    className={cn(
                      'relative flex min-h-[64px] items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-left text-[15px] font-semibold transition-[border-color,background-color,transform] active:scale-[0.98]',
                      active ? LEVEL_STYLE[o.level] : 'border-line bg-surface text-ink hover:bg-surface-2',
                    )}
                  >
                    <span className={cn('size-2.5 shrink-0 rounded-full', o.level === 'good' ? 'bg-success' : o.level === 'moderate' ? 'bg-warning' : o.level === 'bad' ? 'bg-danger' : 'bg-muted')} aria-hidden />
                    {o.label}
                    {active && <Check className="ml-auto size-[18px]" aria-hidden />}
                  </button>
                );
              })}
            </div>

            {meta.valueLabel && (
              <div>
                <label htmlFor="report-value" className="mb-1.5 block text-[13px] font-medium text-ink-2">
                  {meta.valueLabel} <span className="font-normal text-muted">(optional)</span>
                </label>
                <Input id="report-value" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))} placeholder="e.g. 8" className="tabular max-w-40" />
              </div>
            )}

            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink-2">Where</p>
              {place ? (
                <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-bg-2 text-ink-2">
                    <Icon name={CATEGORY_BY_ID[place.categoryId]?.icon ?? 'MapPin'} className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink">{place.name}</span>
                    <span className="block text-[13px] text-muted-2">{CATEGORY_BY_ID[place.categoryId]?.singular}</span>
                  </span>
                  <button type="button" onClick={() => setPicking(true)} className="text-[13px] font-medium text-brand-ink hover:underline">
                    Change
                  </button>
                  {!meta.needsPlace && (
                    <button type="button" onClick={() => setPlace(undefined)} aria-label="Remove place" className="grid size-8 place-items-center rounded-full text-muted-2 hover:bg-bg-2">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ) : (
                <div className={cn('rounded-xl border p-3', needsPlace ? 'border-warning/40 bg-warning-soft' : 'border-line bg-surface')}>
                  <div className="flex items-center gap-3">
                    <MapPin className="size-[18px] shrink-0 text-muted-2" aria-hidden />
                    <span className="min-w-0 flex-1 text-sm text-ink">{needsPlace ? 'This kind of update needs a place.' : `Around ${area}`}</span>
                    <button type="button" onClick={() => setPicking(true)} className="shrink-0 text-[13px] font-semibold text-brand-ink hover:underline">
                      Choose a place
                    </button>
                  </div>
                  {!needsPlace && (
                    <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-muted-2">
                      <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" aria-hidden />
                      Shown as an approximate area ({source === 'gps' ? 'within about 300 m of you' : 'around the area you picked'}), never your exact position.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="report-note" className="mb-1.5 block text-[13px] font-medium text-ink-2">
                Add a detail <span className="font-normal text-muted">(optional)</span>
              </label>
              <Textarea id="report-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, 280))} placeholder="Anything that helps, e.g. “two-wheeler lane is faster”" className="min-h-[76px]" />
              <p className="tabular mt-1 text-right text-[12px] text-muted">{note.length}/280</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
