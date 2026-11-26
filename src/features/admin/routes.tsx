import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { RouteError } from '@/app/router/RouteStates';
import { AdminLayout } from './AdminLayout';

/** Every admin screen is its own chunk, loaded on first visit. */
const page = (load: () => Promise<{ default: ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

/**
 * The admin area: its own layout at /admin, separate from the consumer AppLayout. The access
 * check lives in AdminLayout, so no admin screen renders (or loads data) for anyone else.
 * Spread into the root router: `createBrowserRouter([...appRoutes, ...adminRoutes])`.
 */
export const adminRoutes: RouteObject[] = [
  {
    path: '/admin',
    Component: AdminLayout,
    errorElement: <RouteError />,
    children: [
      {
        // A failing screen is replaced by the error state inside the admin frame, not instead of it.
        errorElement: <RouteError />,
        children: [
          { index: true, ...page(() => import('./pages/DashboardPage')) },
          { path: 'businesses', ...page(() => import('./pages/BusinessesPage')) },
          { path: 'verification', ...page(() => import('./pages/VerificationPage')) },
          { path: 'users', ...page(() => import('./pages/UsersPage')) },
          { path: 'categories', ...page(() => import('./pages/CategoriesPage')) },
          { path: 'reports', ...page(() => import('./pages/ReportsPage')) },
          { path: 'moderation', ...page(() => import('./pages/ModerationPage')) },
          { path: 'reviews', ...page(() => import('./pages/ReviewsPage')) },
          { path: 'deals', ...page(() => import('./pages/DealsPage')) },
          { path: 'events', ...page(() => import('./pages/EventsPage')) },
          { path: 'analytics', ...page(() => import('./pages/AnalyticsPage')) },
          { path: 'settings', ...page(() => import('./pages/SettingsPage')) },
          { path: '*', ...page(() => import('./pages/NotFoundPage')) },
        ],
      },
    ],
  },
];
