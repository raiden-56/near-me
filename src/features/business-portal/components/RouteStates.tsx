import { Compass } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { EmptyState, ErrorState } from '@/components/common/states';
import { LogoMark } from '@/components/navigation/Logo';
import { Button } from '@/components/ui/button';

/** Shown while the portal's first chunk loads on a direct visit. */
export function PortalFallback() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <LogoMark size={56} className="animate-pulse motion-reduce:animate-none" />
        <p className="text-sm text-muted-2">Opening the business portal…</p>
      </div>
    </div>
  );
}

export function PortalNotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="That page is not part of the portal"
      description="The link may be old, or the page may have moved."
      action={
        <Button asChild>
          <Link to="/business">Back to your dashboard</Link>
        </Button>
      }
    />
  );
}

/**
 * Catches render and loader errors. Used twice: inside the layout, so one broken screen keeps the
 * navigation usable, and around the layout (`standalone`), where it has to fill the page itself.
 */
export function PortalRouteError({ standalone }: { standalone?: boolean }) {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  // A failed dynamic import usually means a new version was deployed: reloading fixes it.
  const stale = error instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);

  const body = notFound ? (
    <PortalNotFound />
  ) : (
    <div>
      <ErrorState
        error={stale ? new Error('NearMe was updated while this tab was open. Reload to continue.') : error}
        title={stale ? 'Time for a quick refresh' : 'Something went wrong on this screen'}
        onRetry={() => window.location.reload()}
        className="pb-4"
      />
      <div className="flex justify-center gap-2 pb-10">
        <Button variant="ghost" asChild>
          <Link to="/business">Business portal</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/">Back to NearMe</Link>
        </Button>
      </div>
    </div>
  );

  return <div className={standalone ? 'grid min-h-dvh place-items-center bg-bg' : 'grid min-h-[70dvh] place-items-center'}>{body}</div>;
}
