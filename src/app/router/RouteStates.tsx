import { Compass } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { EmptyState, ErrorState } from '@/components/common/states';
import { LogoMark } from '@/components/navigation/Logo';
import { Button } from '@/components/ui/button';

/** Shown while the first route chunk loads. */
export function AppLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <LogoMark size={56} className="animate-pulse" />
        <p className="text-sm text-muted-2">Finding what is around you…</p>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="This page wandered off"
      description="The link may be old, or the page may have moved."
      action={
        <Button asChild>
          <Link to="/">Back to Discover</Link>
        </Button>
      }
    />
  );
}

/** Catches render and loader errors so one broken screen never takes the whole app down. */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  // A failed dynamic import usually means a new version was deployed: reloading fixes it.
  const stale = error instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);
  return (
    <div className="grid min-h-[70dvh] place-items-center">
      <ErrorState
        error={stale ? new Error('NearMe was updated while this tab was open. Reload to continue.') : error}
        title={stale ? 'Time for a quick refresh' : 'Something went wrong on this screen'}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}
