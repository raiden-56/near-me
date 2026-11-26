import { Link } from 'react-router';
import { Notice } from '@/components/common/states';
import { Panel, PortalPage, SaveBar } from '../components/bits';
import { HoursForm } from '../components/HoursForm';
import { usePortal } from '../context';
import { useSaveListing } from '../hooks';

export default function HoursPage() {
  const { listing } = usePortal();
  const save = useSaveListing('Opening hours saved');
  return (
    <PortalPage title="Opening hours" subtitle="Your regular week. NearMe works out “Open”, “Closing soon” and “Closed” from these.">
      <div className="space-y-5">
        <Panel title="Weekly hours" description="Switch a day off if you are closed. Use the copy button to apply one day to the whole week.">
          <HoursForm
            key={listing.id}
            hours={listing.hours}
            preview
            onSubmit={(data) => save.mutateAsync({ id: listing.id, change: { section: 'hours', data } })}
            footer={(state) => <SaveBar state={state} label="Save hours" />}
          />
        </Panel>
        <Notice>
          Closed for a day, or closing early? You do not need to change your regular hours. Post it from{' '}
          <Link to="/business/availability" className="font-medium text-ink underline underline-offset-2">
            Live availability
          </Link>{' '}
          and customers see it straight away.
        </Notice>
      </div>
    </PortalPage>
  );
}
