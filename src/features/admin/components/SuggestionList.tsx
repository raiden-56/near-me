import { Check, MapPin, X } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CATEGORY_BY_ID } from '@/data/categories';
import { timeAgo } from '@/lib/time';
import type { PlaceSuggestion } from '@/types';
import { useSuggestionMutations } from '../hooks';

const KIND_LABEL: Record<PlaceSuggestion['kind'], string> = {
  add: 'New place',
  edit: 'Suggested edit',
  closed: 'Closure report',
  missing: 'Missing place',
  category: 'Category suggestion',
  photo: 'Photo',
};

const STATUS: Record<PlaceSuggestion['status'], { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

/** Community suggestions with approve / reject. Approving credits the contributor's points. */
export function SuggestionList({ suggestions }: { suggestions: PlaceSuggestion[] }) {
  const { resolve } = useSuggestionMutations();
  return (
    <ul className="divide-y divide-line">
      {suggestions.map((s) => {
        const busy = resolve.isPending && resolve.variables?.id === s.id;
        const category = s.categoryId ? CATEGORY_BY_ID[s.categoryId] : undefined;
        return (
          <li key={s.id} className="flex flex-col gap-3 py-4 first:pt-1 last:pb-1 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="outline">{KIND_LABEL[s.kind]}</Badge>
                {s.status !== 'pending' && <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>}
                {category && <span className="text-[12.5px] text-muted-2">{category.label}</span>}
              </div>
              <p className="mt-1.5 text-[15px] font-semibold text-ink">{s.name}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{s.details}</p>
              {s.photos && s.photos.length > 0 && (
                <ul className="mt-2 flex gap-2">
                  {s.photos.slice(0, 4).map((src, i) => (
                    <li key={i}>
                      <img src={src} alt={`Photo ${i + 1} attached to the suggestion for ${s.name}`} loading="lazy" className="size-16 rounded-lg border border-line object-cover" />
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-2">
                <span>From {s.userName}</span>
                <span aria-hidden>·</span>
                <span className="tabular">{timeAgo(s.createdAt)}</span>
                {s.placeId ? (
                  <Link to={`/place/${s.placeId}`} className="inline-flex items-center gap-1 font-medium text-brand-ink hover:underline">
                    <MapPin className="size-3.5" aria-hidden /> View the place
                  </Link>
                ) : (
                  s.lat != null &&
                  s.lon != null && (
                    <span className="tabular inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden /> {s.lat.toFixed(5)}, {s.lon.toFixed(5)}
                    </span>
                  )
                )}
              </p>
            </div>
            {s.status === 'pending' && (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" loading={busy && resolve.variables?.decision === 'approved'} disabled={busy} onClick={() => resolve.mutate({ id: s.id, decision: 'approved' })}>
                  <Check /> Approve
                </Button>
                <Button size="sm" variant="secondary" loading={busy && resolve.variables?.decision === 'rejected'} disabled={busy} onClick={() => resolve.mutate({ id: s.id, decision: 'rejected' })}>
                  <X /> Reject
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
