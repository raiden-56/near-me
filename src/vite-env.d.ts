/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_MAP_STYLE_DARK_URL?: string;
  readonly VITE_MAP_API_KEY?: string;
  readonly VITE_MAP_BRAND_THEME?: string;
  readonly VITE_POI_TILEJSON_URL?: string;
  readonly VITE_OVERPASS_URLS?: string;
  readonly VITE_PHOTON_URL?: string;
  readonly VITE_NOMINATIM_URL?: string;
  readonly VITE_OSRM_URL?: string;
  readonly VITE_COMMONS_API_URL?: string;
  readonly VITE_DEFAULT_LAT?: string;
  readonly VITE_DEFAULT_LON?: string;
  readonly VITE_DEFAULT_AREA?: string;
  readonly VITE_DEFAULT_CITY?: string;
  readonly VITE_DEFAULT_COUNTRY_CODE?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
}
