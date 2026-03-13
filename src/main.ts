import './styles/main.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import { inject } from '@vercel/analytics';
import { App } from './App';
// Suppress NotAllowedError from YouTube IFrame API's internal play() — browser autoplay policy,
// not actionable. The YT IFrame API doesn't expose the play() promise so it leaks as unhandled.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.name === 'NotAllowedError') e.preventDefault();
});

import { debugInjectTestEvents, debugGetCells, getCellCount } from '@/services/geo-convergence';
import { initMetaTags } from '@/services/meta-tags';
import { installRuntimeFetchPatch } from '@/services/runtime';
import { applyStoredTheme } from '@/utils/theme-manager';
import { clearChunkReloadGuard, installChunkReloadGuard } from '@/bootstrap/chunk-reload';

// Auto-reload on stale chunk 404s after deployment (Vite fires this for modulepreload failures).
const chunkReloadStorageKey = installChunkReloadGuard(__APP_VERSION__);

// Initialize Vercel Analytics
inject();

// Initialize dynamic meta tags for sharing
initMetaTags();

installRuntimeFetchPatch();

// Apply stored theme preference before app initialization (safety net for inline script)
applyStoredTheme();

// Remove no-transition class after first paint to enable smooth theme transitions
requestAnimationFrame(() => {
  document.documentElement.classList.remove('no-transition');
});

const app = new App('app');
app
  .init()
  .then(() => {
    // Clear the one-shot guard after a successful boot so future stale-chunk incidents can recover.
    clearChunkReloadGuard(chunkReloadStorageKey);
  })
  .catch(console.error);

// Debug helpers for geo-convergence testing (remove in production)
(window as unknown as Record<string, unknown>).geoDebug = {
  inject: debugInjectTestEvents,
  cells: debugGetCells,
  count: getCellCount,
};

// Beta mode toggle: type `beta=true` / `beta=false` in console
Object.defineProperty(window, 'beta', {
  get() {
    const on = localStorage.getItem('worldmonitor-beta-mode') === 'true';
    console.log(`[Beta] ${on ? 'ON' : 'OFF'}`);
    return on;
  },
  set(v: boolean) {
    if (v) localStorage.setItem('worldmonitor-beta-mode', 'true');
    else localStorage.removeItem('worldmonitor-beta-mode');
    location.reload();
  },
});
