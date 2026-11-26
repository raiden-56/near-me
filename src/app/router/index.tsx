import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { BASE_PATH } from '@/lib/env';
import { AppLayout } from '../layouts/AppLayout';
import { AppLoading, NotFound, RouteError } from './RouteStates';

/** Every screen is its own chunk, loaded on first visit. */
const page = (load: () => Promise<{ default: ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

/** The consumer app: one shell (navigation, banners, global sheets) around these screens. */
const appRoutes: RouteObject[] = [
  { index: true, ...page(() => import('@/features/discovery/pages/DiscoverPage')) },
  { path: 'search', ...page(() => import('@/features/search/pages/SearchPage')) },
  { path: 'categories', ...page(() => import('@/features/discovery/pages/CategoriesPage')) },
  { path: 'category/:id', ...page(() => import('@/features/discovery/pages/CategoryPage')) },
  { path: 'map', ...page(() => import('@/features/maps/pages/MapPage')) },
  { path: 'place/:id', ...page(() => import('@/features/businesses/pages/PlaceDetailsPage')) },
  { path: 'place/:id/reviews', ...page(() => import('@/features/reviews/pages/ReviewsPage')) },
  { path: 'live', ...page(() => import('@/features/community/pages/LivePage')) },
  { path: 'deals', ...page(() => import('@/features/deals/pages/DealsPage')) },
  { path: 'events', ...page(() => import('@/features/events/pages/EventsPage')) },
  { path: 'emergency', ...page(() => import('@/features/emergency/pages/EmergencyPage')) },
  { path: 'saved', ...page(() => import('@/features/saved/pages/SavedPage')) },
  { path: 'collections/:id', ...page(() => import('@/features/saved/pages/CollectionPage')) },
  { path: 'notifications', ...page(() => import('@/features/notifications/pages/NotificationsPage')) },
  { path: 'profile', ...page(() => import('@/features/profile/pages/ProfilePage')) },
  { path: 'profile/contributions', ...page(() => import('@/features/profile/pages/ContributionsPage')) },
  { path: 'contribute', ...page(() => import('@/features/profile/pages/ContributePage')) },
  { path: 'settings', ...page(() => import('@/features/profile/pages/SettingsPage')) },
  { path: 'settings/location', ...page(() => import('@/features/profile/pages/LocationSettingsPage')) },
  { path: 'login', ...page(() => import('@/features/auth/pages/LoginPage')) },
  { path: 'register', ...page(() => import('@/features/auth/pages/RegisterPage')) },
  { path: 'forgot-password', ...page(() => import('@/features/auth/pages/ForgotPasswordPage')) },
  { path: 'offline', ...page(() => import('@/features/profile/pages/OfflinePage')) },
  { path: '*', Component: NotFound },
];

/**
 * The business portal and the admin area are separate applications with their own layouts.
 * Their whole route trees (layout, services, charts) are downloaded only when someone first
 * navigates under their path, so people who only browse never pay for them.
 */
const WORKSPACES: Record<string, () => Promise<RouteObject[]>> = {
  '/business': async () => (await import('@/features/business-portal/routes')).businessRoutes,
  '/admin': async () => (await import('@/features/admin/routes')).adminRoutes,
};
const patched = new Set<string>();

export const router = createBrowserRouter(
  [
    {
      path: '/',
      Component: AppLayout,
      errorElement: <RouteError />,
      hydrateFallbackElement: <AppLoading />,
      children: [{ errorElement: <RouteError />, children: appRoutes }],
    },
  ],
  {
    // '' at a domain root; '/near-me' when hosted under a sub-path such as GitHub Pages.
    basename: BASE_PATH || '/',
    async patchRoutesOnNavigation({ path: fullPath, patch }) {
      // Tolerate the path arriving with or without the basename.
      const path = BASE_PATH && fullPath.startsWith(BASE_PATH) ? fullPath.slice(BASE_PATH.length) || '/' : fullPath;
      for (const [prefix, load] of Object.entries(WORKSPACES)) {
        if (patched.has(prefix) || !(path === prefix || path.startsWith(`${prefix}/`))) continue;
        const routes = await load();
        // Checked again after the await: two navigations can race to the same workspace.
        if (patched.has(prefix)) continue;
        patched.add(prefix);
        patch(null, routes);
      }
    },
  },
);
