import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/common/states';
import { Button } from '@/components/ui/button';

export default function AdminNotFoundPage() {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-4">
      <EmptyState
        icon={Compass}
        title="There is no admin screen here"
        description="The link may be old. Every admin screen is listed in the menu."
        action={
          <Button asChild>
            <Link to="/admin">Go to the dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
