import { ExternalLink, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Notice } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/sheet';
import { listingPlaceId } from '@/services/businessPortal';
import { Panel, PortalPage, SaveBar, VerificationBadge } from '../components/bits';
import { AmenitiesForm, ContactForm, DetailsForm } from '../components/ListingForms';
import { LocationForm } from '../components/LocationForm';
import { usePortal } from '../context';
import { useDeleteListing, useSaveListing } from '../hooks';
import { usePortalUi } from '../store';

export default function ProfilePage() {
  const { listing, listings } = usePortal();
  const navigate = useNavigate();
  const selectListing = usePortalUi((s) => s.setActiveListing);
  const save = useSaveListing('Changes saved');
  const remove = useDeleteListing();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isPublic = Boolean(listing.placeId) || listing.verification === 'verified';

  const deleteListing = () =>
    remove.mutate(listing.id, {
      onSuccess: () => {
        setConfirmDelete(false);
        selectListing(listings.find((l) => l.id !== listing.id)?.id ?? null);
        navigate('/business');
      },
    });

  return (
    <PortalPage
      title="Profile"
      subtitle="What customers read on your listing. Each section saves on its own."
      eyebrow={<VerificationBadge status={listing.verification} />}
      actions={
        isPublic && (
          <Button variant="secondary" asChild>
            <Link to={`/place/${listingPlaceId(listing)}`}>
              <ExternalLink /> View in NearMe
            </Link>
          </Button>
        )
      }
    >
      <div className="space-y-5">
        {!isPublic && <Notice>Customers cannot see this listing yet. It becomes public once it has been verified.</Notice>}

        <Panel id="details" title="Business details" description="Your name, what you do, and where you belong in the category list.">
          <DetailsForm key={`details-${listing.id}`} listing={listing} withCategory onSubmit={(data) => save.mutateAsync({ id: listing.id, change: { section: 'details', data } })} footer={(state) => <SaveBar state={state} />} />
        </Panel>

        <Panel id="location" title="Location" description="The pin customers are guided to. Put it on your entrance.">
          <LocationForm key={`location-${listing.id}`} listing={listing} onSubmit={(data) => save.mutateAsync({ id: listing.id, change: { section: 'location', data } })} footer={(state) => <SaveBar state={state} label="Save location" />} />
        </Panel>

        <Panel id="contact" title="Contact details" description="How customers reach you, and the address shown on your listing.">
          <ContactForm key={`contact-${listing.id}`} listing={listing} onSubmit={(data) => save.mutateAsync({ id: listing.id, change: { section: 'contact', data } })} footer={(state) => <SaveBar state={state} />} />
        </Panel>

        <Panel id="amenities" title="Amenities" description="Tick everything customers can count on. The list is tailored to your category.">
          <AmenitiesForm
            key={`amenities-${listing.id}-${listing.categoryId}`}
            listing={listing}
            onSubmit={(data) => save.mutateAsync({ id: listing.id, change: { section: 'amenities', data } })}
            footer={(state) => <SaveBar state={state} />}
          />
        </Panel>

        <Panel title="Delete this listing" description="Removes the listing, its photos, offers and live updates from NearMe. Reviews written by customers stay with the place.">
          <Button variant="danger-soft" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete listing
          </Button>
        </Panel>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${listing.name || 'this listing'}?`}
        description="The listing, its photos, offers and live updates are removed for good. This cannot be undone."
        confirmLabel="Delete listing"
        destructive
        loading={remove.isPending}
        onConfirm={deleteListing}
      />
    </PortalPage>
  );
}
