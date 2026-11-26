import '@fontsource-variable/dm-sans/opsz.css';
import '@fontsource-variable/fraunces/opsz.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from './app/providers/AppProviders';
import { router } from './app/router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
