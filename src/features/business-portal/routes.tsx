import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { BusinessLayout } from './components/BusinessLayout';
import { PortalFallback, PortalNotFound, PortalRouteError } from './components/RouteStates';

/** Every portal screen is its own chunk, loaded on first visit. */
const page = (load: () => Promise<{ default: ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

/**
 * The business owner portal, mounted at /business with its own layout (not the consumer AppLayout).
 * Add it to the root router next to the app's routes:
 *
 *   createBrowserRouter([{ path: '/', Component: AppLayout, ... }, ...businessRoutes])
 *
 * Access is decided by the layout, not by loaders: signed-out visitors get the introduction,
 * accounts without a listing get the welcome screen, and the service checks ownership on every call.
 */
export const businessRoutes: RouteObject[] = [
  {
    path: '/business',
    Component: BusinessLayout,
    errorElement: <PortalRouteError standalone />,
    hydrateFallbackElement: <PortalFallback />,
    children: [
      {
        // Errors on a single screen render inside the layout, so the navigation stays usable.
        errorElement: <PortalRouteError />,
        children: [
          { index: true, ...page(() => import('./pages/DashboardPage')) },
          { path: 'onboarding', ...page(() => import('./pages/OnboardingPage')) },
          { path: 'claim', ...page(() => import('./pages/ClaimPage')) },
          { path: 'verification', ...page(() => import('./pages/VerificationPage')) },
          { path: 'profile', ...page(() => import('./pages/ProfilePage')) },
          { path: 'services', ...page(() => import('./pages/ServicesPage')) },
          { path: 'hours', ...page(() => import('./pages/HoursPage')) },
          { path: 'photos', ...page(() => import('./pages/PhotosPage')) },
          { path: 'offers', ...page(() => import('./pages/OffersPage')) },
          { path: 'reviews', ...page(() => import('./pages/ReviewsPage')) },
          { path: 'availability', ...page(() => import('./pages/AvailabilityPage')) },
          { path: 'analytics', ...page(() => import('./pages/AnalyticsPage')) },
          { path: 'subscription', ...page(() => import('./pages/SubscriptionPage')) },
          { path: '*', Component: PortalNotFound },
        ],
      },
    ],
  },
];
