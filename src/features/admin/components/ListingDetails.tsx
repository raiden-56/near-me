import { ExternalLink, FileText, Globe, Mail, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router';
import { Icon } from '@/components/common/Icon';
import { Notice } from '@/components/common/states';
import { CATEGORY_BY_ID, GROUP_BY_ID, TONES } from '@/data/categories';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import type { BusinessListing, DayKey } from '@/types';
import { Detail, PlanBadge, VerificationBadge } from './kit';

const DAYS: [DayKey, string][] = [
  ['mo', 'Mon'],
  ['tu', 'Tue'],
  ['we', 'Wed'],
  ['th', 'Thu'],
  ['fr', 'Fri'],
  ['sa', 'Sat'],
  ['su', 'Sun'],
];

const AVAILABILITY_LABEL = { open: 'Open', busy: 'Busy', limited: 'Limited', closed: 'Closed' } as const;

const websiteHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

export function CategoryCell({ categoryId, className }: { categoryId: string; className?: string }) {
  const cat = CATEGORY_BY_ID[categoryId];
  const tone = TONES[GROUP_BY_ID[cat?.groupId ?? 'daily'].tone];
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 text-sm text-ink-2', className)}>
      <span className={cn('grid size-7 shrink-0 place-items-center rounded-lg', tone.soft)}>
        <Icon name={cat?.icon ?? 'MapPin'} className="size-3.5" />
      </span>
      <span className="truncate">{cat?.label ?? categoryId}</span>
    </span>
  );
}

/** The document a business attached to its verification request: a note, a link or an image. */
function VerificationDocument({ doc }: { doc: string }) {
  if (doc.startsWith('data:image/')) {
    return (
      <a href={doc} target="_blank" rel="noreferrer" className="block w-fit overflow-hidden rounded-xl border border-line">
        <img src={doc} alt="Verification document supplied by the business" className="max-h-56 w-auto" />
      </a>
    );
  }
  if (/^https?:\/\//i.test(doc)) {
    return (
      <a href={doc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink hover:underline">
        <ExternalLink className="size-4" aria-hidden /> Open the document
      </a>
    );
  }
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{doc}</p>;
}

/** Everything an admin needs to judge a listing, used on the Businesses and Verification screens. */
export function ListingDetails({ listing, className }: { listing: BusinessListing; className?: string }) {
  const publicPath = `/place/${listing.placeId ?? `l_${listing.id}`}`;
  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <VerificationBadge status={listing.verification} />
        <PlanBadge plan={listing.plan} />
        <CategoryCell categoryId={listing.categoryId} />
      </div>

      {listing.verificationNote && (
        <Notice tone={listing.verification === 'rejected' ? 'danger' : 'info'}>
          <span className="font-medium">Note to the owner:</span> {listing.verificationNote}
        </Notice>
      )}

      <p className="text-sm leading-relaxed text-ink-2">{listing.description || 'No description provided.'}</p>

      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Detail label="Owner">{listing.ownerName}</Detail>
        <Detail label="Submitted">
          Created {timeAgo(listing.createdAt)}, updated {timeAgo(listing.updatedAt)}
        </Detail>
        <Detail label="Address" className="sm:col-span-2">
          <span className="inline-flex items-start gap-1.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-2" aria-hidden />
            <span>
              {listing.address || 'No address provided'}
              <span className="tabular block text-[12.5px] text-muted-2">
                {listing.lat.toFixed(5)}, {listing.lon.toFixed(5)}
              </span>
            </span>
          </span>
        </Detail>
        <Detail label="Phone">
          {listing.phone ? (
            <a href={`tel:${listing.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 hover:underline">
              <Phone className="size-4 text-muted-2" aria-hidden /> {listing.phone}
            </a>
          ) : (
            'Not provided'
          )}
        </Detail>
        <Detail label="Email">
          {listing.email ? (
            <a href={`mailto:${listing.email}`} className="inline-flex items-center gap-1.5 hover:underline">
              <Mail className="size-4 text-muted-2" aria-hidden /> {listing.email}
            </a>
          ) : (
            'Not provided'
          )}
        </Detail>
        <Detail label="Website" className="sm:col-span-2">
          {listing.website ? (
            <a href={websiteHref(listing.website)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
              <Globe className="size-4 text-muted-2" aria-hidden /> {listing.website}
            </a>
          ) : (
            'Not provided'
          )}
        </Detail>
      </dl>

      <section>
        <h3 className="mb-2 text-[13px] font-medium text-ink-2">Place on the map</h3>
        <Link to={publicPath} className="flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:bg-surface-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sage text-sage-ink">
            <MapPin className="size-[18px]" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">{listing.placeId ? 'Claims an OpenStreetMap place' : 'NearMe-only listing'}</span>
            <span className="tabular block truncate text-[12.5px] text-muted-2">{listing.placeId ? `Place id ${listing.placeId}` : 'Not linked to an OpenStreetMap place'}</span>
          </span>
          <ExternalLink className="size-4 shrink-0 text-muted" aria-hidden />
        </Link>
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
          <FileText className="size-4" aria-hidden /> Verification document
        </h3>
        {listing.verificationDoc ? (
          <div className="rounded-xl border border-line bg-surface-2 p-3.5">
            <VerificationDocument doc={listing.verificationDoc} />
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line-2 px-3.5 py-3 text-sm text-muted-2">The business has not attached a document or note.</p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-medium text-ink-2">Opening hours</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          {DAYS.map(([key, label]) => {
            const day = listing.hours?.[key];
            return (
              <div key={key} className="flex justify-between gap-2 sm:block">
                <dt className="text-muted-2">{label}</dt>
                <dd className="tabular text-ink">{!day || day.closed ? 'Closed' : `${day.open} – ${day.close}`}</dd>
              </div>
            );
          })}
        </dl>
      </section>

      {listing.availability && (
        <section>
          <h3 className="mb-1 text-[13px] font-medium text-ink-2">Current availability</h3>
          <p className="text-sm text-ink">
            {AVAILABILITY_LABEL[listing.availability.status]}
            {listing.availability.waitMinutes != null && `, about ${listing.availability.waitMinutes} min wait`}
            {listing.availability.note && `. ${listing.availability.note}`}
            <span className="text-muted-2"> · updated {timeAgo(listing.availability.updatedAt)}</span>
          </p>
        </section>
      )}

      {listing.services.length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-medium text-ink-2">Services</h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {listing.services.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-3 px-3.5 py-2 text-sm">
                <span className="min-w-0 text-ink">
                  {s.name}
                  {s.note && <span className="block text-[12.5px] text-muted-2">{s.note}</span>}
                </span>
                {s.price && <span className="tabular shrink-0 text-ink-2">{s.price}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {listing.amenities.length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-medium text-ink-2">Amenities</h3>
          <p className="text-sm text-ink">{listing.amenities.join(', ')}</p>
        </section>
      )}

      {listing.photos.length > 0 && (
        <section>
          <h3 className="mb-2 text-[13px] font-medium text-ink-2">Photos</h3>
          <ul className="grid grid-cols-3 gap-2">
            {listing.photos.map((src, i) => (
              <li key={i}>
                <img src={src} alt={`${listing.name}, photo ${i + 1}`} loading="lazy" className="aspect-square w-full rounded-xl border border-line object-cover" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
