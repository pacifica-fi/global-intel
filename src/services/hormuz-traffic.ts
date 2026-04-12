/**
 * Strait of Hormuz Status Service
 * Fetches curated monitoring data from hormuzstraitmonitor.com via the relay.
 * Replaces the previous AIS-based approach due to poor Persian Gulf coverage.
 */

const wsRelayUrl = import.meta.env.VITE_WS_RELAY_URL || '';
const RAILWAY_HORMUZ_URL = wsRelayUrl
  ? wsRelayUrl.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/$/, '') + '/hormuz-status'
  : '';
const VERCEL_HORMUZ_API = '/api/hormuz-status';
const LOCAL_HORMUZ_FALLBACK = 'http://localhost:3004/hormuz-status';

export interface HormuzStraitStatus {
  state: string;
  since: string;
  duration?: { days: number; hours: number; minutes: number };
}

export interface HormuzTrafficData {
  transitingNow?: number;
  last24h?: number;
  normalAvg?: number;
  pctOfNormal?: number;
  dwtThroughput?: string;
}

export interface HormuzWarRisk {
  level?: string;
  premium?: number;
  normalPremium?: number;
  multiplier?: number;
}

export interface HormuzLngImpact {
  lngPctAtRisk?: number;
  dailyCost?: string;
  importersAtRisk?: string;
}

export interface HormuzSupplyChain {
  shippingRateIncrease?: number;
  cpiImpact?: number;
  sprDays?: number;
  supertankerRates?: string;
  freightersStuck?: number;
  carriersSuspended?: string[];
}

export interface HormuzAlternativeRoute {
  name: string;
  extraDays?: number;
  extraCost?: string;
  capacity?: string;
  status?: string;
  coverage?: string;
}

export interface HormuzTimelineEvent {
  date: string;
  type: string;
  description: string;
}

export interface HormuzNewsItem {
  title: string;
  url: string;
}

export interface HormuzPeaceTalks {
  status: string;
  location?: string;
  usLead?: string;
  iranLead?: string;
}

export interface HormuzStatusData {
  fetchedAt: string;
  status: HormuzStraitStatus | null;
  traffic: HormuzTrafficData | null;
  warRisk: HormuzWarRisk | null;
  lngImpact: HormuzLngImpact | null;
  supplyChain: HormuzSupplyChain | null;
  alternativeRoutes: HormuzAlternativeRoute[];
  crisisTimeline: HormuzTimelineEvent[];
  latestNews: HormuzNewsItem[];
  peaceTalks: HormuzPeaceTalks | null;
  error?: string;
}

type StatusCallback = (data: HormuzStatusData) => void;

const callbacks = new Set<StatusCallback>();
let cachedData: HormuzStatusData | null = null;
let lastFetch = 0;
let fetchTimer: ReturnType<typeof setInterval> | null = null;
let isFetching = false;

const POLL_INTERVAL = 5 * 60 * 1000; // 5 min

export function registerHormuzStatusCallback(cb: StatusCallback): void {
  callbacks.add(cb);
  if (cachedData) cb(cachedData);
}

export function unregisterHormuzStatusCallback(cb: StatusCallback): void {
  callbacks.delete(cb);
}

function notifyAll(data: HormuzStatusData): void {
  for (const cb of callbacks) {
    try { cb(data); } catch { /* ignore */ }
  }
}

function getUrls(): string[] {
  const urls: string[] = [];
  if (RAILWAY_HORMUZ_URL) urls.push(RAILWAY_HORMUZ_URL);
  urls.push(VERCEL_HORMUZ_API);
  urls.push(LOCAL_HORMUZ_FALLBACK);
  return urls;
}

async function fetchStatus(): Promise<HormuzStatusData> {
  const urls = getUrls();
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      if (data && data.fetchedAt) return data as HormuzStatusData;
    } catch {
      continue;
    }
  }
  throw new Error('All Hormuz status endpoints failed');
}

async function poll(): Promise<void> {
  if (isFetching) return;
  isFetching = true;
  try {
    const data = await fetchStatus();
    cachedData = data;
    lastFetch = Date.now();
    notifyAll(data);
  } catch {
    // Keep stale data
  } finally {
    isFetching = false;
  }
}

export function initHormuzStatusTracking(): void {
  if (fetchTimer) return;
  poll(); // Initial fetch
  fetchTimer = setInterval(poll, POLL_INTERVAL);
}

export function stopHormuzStatusTracking(): void {
  if (fetchTimer) {
    clearInterval(fetchTimer);
    fetchTimer = null;
  }
  callbacks.clear();
}

export function getHormuzCachedStatus(): HormuzStatusData | null {
  return cachedData;
}

export function isHormuzStatusActive(): boolean {
  return fetchTimer !== null;
}

// Legacy compatibility exports (used by panel count display)
export function initHormuzTracking(): void {
  initHormuzStatusTracking();
}

export function disconnectHormuzTracking(): void {
  stopHormuzStatusTracking();
}

export function isHormuzTrackingActive(): boolean {
  return isHormuzStatusActive();
}

export function getHormuzStats(): { total: number; lastUpdate: number } {
  return { total: cachedData?.traffic?.transitingNow ?? 0, lastUpdate: lastFetch };
}

export function getHormuzCenter(): { lat: number; lon: number } {
  return { lat: 26.5, lon: 56.5 };
}

// Re-export for panel compatibility
export type HormuzTrafficStats = ReturnType<typeof getHormuzStats>;
