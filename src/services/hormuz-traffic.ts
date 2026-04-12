/**
 * Strait of Hormuz Status Service
 * Fetches curated monitoring data directly from hormuzstraitmonitor.com/api/dashboard.
 */

const API_URL = 'https://hormuzstraitmonitor.com/api/dashboard';

// --- API Response Types (match the dashboard JSON) ---

export interface HormuzStraitStatus {
  status: string;
  since: string;
  description: string;
}

export interface HormuzShipCount {
  currentTransits: number;
  last24h: number;
  normalDaily: number;
  percentOfNormal: number;
}

export interface HormuzOilPrice {
  brentPrice: number;
  change24h: number;
  changePercent24h: number;
  sparkline: number[];
}

export interface HormuzStrandedVessels {
  total: number;
  tankers: number;
  bulk: number;
  other: number;
  changeToday: number;
}

export interface HormuzInsurance {
  level: string;
  warRiskPercent: number;
  normalPercent: number;
  multiplier: number;
}

export interface HormuzThroughput {
  todayDWT: number;
  averageDWT: number;
  percentOfNormal: number;
  last7Days: number[];
}

export interface HormuzDiplomacy {
  status: string;
  headline: string;
  date: string;
  parties: string[];
  summary: string;
}

export interface HormuzAffectedRegion {
  name: string;
  severity: string;
  oilDependencyPercent: number;
  description: string;
}

export interface HormuzLngImpact {
  percentOfWorldLngAtRisk: number;
  estimatedLngDailyCostBillions: number;
  topAffectedImporters: string[];
  description: string;
}

export interface HormuzAlternativeRoute {
  name: string;
  additionalDays: number;
  additionalCostPerVessel: number;
  currentUsageStatus: string;
}

export interface HormuzSupplyChainImpact {
  shippingRateIncreasePercent: number;
  consumerPriceImpactPercent: number;
  sprStatusDays: number;
  keyDisruptions: string[];
}

export interface HormuzGlobalTradeImpact {
  percentOfWorldOilAtRisk: number;
  estimatedDailyCostBillions: number;
  affectedRegions: HormuzAffectedRegion[];
  lngImpact: HormuzLngImpact;
  alternativeRoutes: HormuzAlternativeRoute[];
  supplyChainImpact: HormuzSupplyChainImpact;
}

export interface HormuzTimelineEvent {
  date: string;
  type: string;
  title: string;
  description: string;
}

export interface HormuzNewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  description: string;
}

// Composite dashboard data
export interface HormuzDashboardData {
  straitStatus: HormuzStraitStatus;
  shipCount: HormuzShipCount;
  oilPrice: HormuzOilPrice;
  strandedVessels: HormuzStrandedVessels;
  insurance: HormuzInsurance;
  throughput: HormuzThroughput;
  diplomacy: HormuzDiplomacy;
  globalTradeImpact: HormuzGlobalTradeImpact;
  crisisTimeline: HormuzTimelineEvent[];
  news: HormuzNewsItem[];
  lastUpdated: string;
}

// Internal wrapper for the panel
export interface HormuzStatusData {
  fetchedAt: string;
  data: HormuzDashboardData | null;
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

async function fetchDashboard(): Promise<HormuzStatusData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(API_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json?.success && json?.data) {
      return {
        fetchedAt: json.data.lastUpdated || new Date().toISOString(),
        data: json.data as HormuzDashboardData,
      };
    }
    throw new Error('Invalid response format');
  } finally {
    clearTimeout(timeout);
  }
}

async function poll(): Promise<void> {
  if (isFetching) return;
  isFetching = true;
  try {
    const data = await fetchDashboard();
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

// Legacy compatibility exports
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
  return { total: cachedData?.data?.shipCount?.currentTransits ?? 0, lastUpdate: lastFetch };
}

export function getHormuzCenter(): { lat: number; lon: number } {
  return { lat: 26.5, lon: 56.5 };
}

export type HormuzTrafficStats = ReturnType<typeof getHormuzStats>;
