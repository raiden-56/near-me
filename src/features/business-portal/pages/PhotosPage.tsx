import { Panel, PortalPage } from '../components/bits';
import { PhotoManager } from '../components/PhotoManager';
import { usePortal } from '../context';

export default function PhotosPage() {
  const { listing } = usePortal();
  return (
    <PortalPage title="Photos" subtitle="Show the storefront, the inside, and what you make or do. The first photo is your cover.">
      <Panel title="Listing photos" description="Changes here are saved as you make them.">
        <PhotoManager key={listing.id} listing={listing} />
      </Panel>
    </PortalPage>
  );
}
