/**
 * Strait of Hormuz Traffic Monitoring Service
 * Filters AIS data to the Hormuz bounding box and classifies vessels.
 * Uses the shared AIS stream via callback system (same pattern as military-vessels.ts).
 */
import {
  registerAisCallback,
  unregisterAisCallback,
  isAisConfigured,
  initAisStream,
  type AisPositionData,
} from './ais';

// Strait of Hormuz bounding box (extended to cover Persian Gulf approaches)
const HORMUZ_BOUNDS = {
  north: 28.5,
  south: 24.0,
  west: 52.0,
  east: 58.0,
  center: { lat: 26.5, lon: 56.5 },
};

const VESSEL_STALE_MS = 30 * 60 * 1000; // 30 minutes

export type HormuzVesselCategory = 'tanker' | 'cargo' | 'passenger' | 'military' | 'other';

export interface HormuzVessel {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  category: HormuzVesselCategory;
  shipType?: number;
  heading?: number;
  speed?: number;
  course?: number;
  lastUpdate: number;
}

export interface HormuzTrafficStats {
  total: number;
  tankers: number;
  cargo: number;
  passenger: number;
  military: number;
  other: number;
  congestion: 'normal' | 'elevated' | 'high';
  trend: 'up' | 'down' | 'stable';
  lastUpdate: number;
}

const trackedVessels = new Map<string, HormuzVessel>();
let prevTotal = 0;
let isTracking = false;
let statsCache: HormuzTrafficStats | null = null;

/**
 * Classify vessel by AIS ship type code into broad categories.
 */
function classifyVessel(shipType?: number): HormuzVesselCategory {
  if (shipType === undefined || shipType === null) return 'other';
  // Military ops or law enforcement
  if (shipType === 35 || shipType === 55) return 'military';
  // Tanker
  if (shipType >= 80 && shipType <= 89) return 'tanker';
  // Cargo
  if (shipType >= 70 && shipType <= 79) return 'cargo';
  // Passenger
  if (shipType >= 60 && shipType <= 69) return 'passenger';
  return 'other';
}

function isInBounds(lat: number, lon: number): boolean {
  return (
    lat >= HORMUZ_BOUNDS.south &&
    lat <= HORMUZ_BOUNDS.north &&
    lon >= HORMUZ_BOUNDS.west &&
    lon <= HORMUZ_BOUNDS.east
  );
}

function processPosition(data: AisPositionData): void {
  if (!Number.isFinite(data.lat) || !Number.isFinite(data.lon)) return;
  if (!isInBounds(data.lat, data.lon)) return;

  const now = Date.now();
  trackedVessels.set(data.mmsi, {
    mmsi: data.mmsi,
    name: data.name || '',
    lat: data.lat,
    lon: data.lon,
    category: classifyVessel(data.shipType),
    shipType: data.shipType,
    heading: data.heading,
    speed: data.speed,
    course: data.course,
    lastUpdate: now,
  });
}

function cleanup(): void {
  const cutoff = Date.now() - VESSEL_STALE_MS;
  for (const [mmsi, v] of trackedVessels) {
    if (v.lastUpdate < cutoff) trackedVessels.delete(mmsi);
  }
}

/**
 * Initialize Hormuz traffic tracking via shared AIS stream.
 */
export function initHormuzTracking(): void {
  if (isTracking) return;
  registerAisCallback(processPosition);
  isTracking = true;
  if (isAisConfigured()) initAisStream();
}

export function disconnectHormuzTracking(): void {
  if (!isTracking) return;
  unregisterAisCallback(processPosition);
  isTracking = false;
}

export function isHormuzTrackingActive(): boolean {
  return isTracking;
}

/**
 * Get all tracked vessels in the Hormuz bounding box.
 */
export function getHormuzVessels(): HormuzVessel[] {
  cleanup();
  return Array.from(trackedVessels.values());
}

/**
 * Compute traffic statistics.
 */
export function getHormuzStats(): HormuzTrafficStats {
  cleanup();
  const vessels = Array.from(trackedVessels.values());
  const total = vessels.length;

  let tankers = 0, cargo = 0, passenger = 0, military = 0, other = 0;
  for (const v of vessels) {
    switch (v.category) {
      case 'tanker': tankers++; break;
      case 'cargo': cargo++; break;
      case 'passenger': passenger++; break;
      case 'military': military++; break;
      default: other++; break;
    }
  }

  // Congestion heuristic based on total vessel count in the strait
  let congestion: HormuzTrafficStats['congestion'] = 'normal';
  if (total >= 30) congestion = 'high';
  else if (total >= 15) congestion = 'elevated';

  // Trend
  let trend: HormuzTrafficStats['trend'] = 'stable';
  if (total > prevTotal + 2) trend = 'up';
  else if (total < prevTotal - 2) trend = 'down';
  prevTotal = total;

  statsCache = {
    total,
    tankers,
    cargo,
    passenger,
    military,
    other,
    congestion,
    trend,
    lastUpdate: Date.now(),
  };
  return statsCache;
}

/**
 * Get the Hormuz bounding box center (for flying the main map).
 */
export function getHormuzCenter(): { lat: number; lon: number } {
  return { ...HORMUZ_BOUNDS.center };
}
