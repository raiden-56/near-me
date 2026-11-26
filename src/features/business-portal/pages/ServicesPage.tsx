import { Panel, PortalPage, SaveBar } from '../components/bits';
import { ServicesForm } from '../components/ServicesForm';
import { usePortal } from '../context';
import { useSaveListing } from '../hooks';

export default function ServicesPage() {
  const { listing } = usePortal();
  const save = useSaveListing('Services saved');
  return (
    <PortalPage title="Services" subtitle="What customers can get from you. The order here is the order on your listing.">
      <Panel title="Your services" description="Add a name, and a price or a short note if it helps. Use the arrows to reorder.">
        <ServicesForm
          key={listing.id}
          services={listing.services}
          onSubmit={(data) => save.mutateAsync({ id: listing.id, change: { section: 'services', data } })}
          footer={(state) => <SaveBar state={state} label="Save services" />}
        />
      </Panel>
    </PortalPage>
  );
}
