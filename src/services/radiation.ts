// Radiation Monitoring - Safecast API + EPA RadNet
// Based on Crucix safecast and epa sources

import { createCircuitBreaker } from '@/utils';
import { isFeatureAvailable } from './runtime-config';

const SAFECAST_API = 'https://api.safecast.org/v2/measurements.json';
const EPA_RADNET_API = 'https://api.epa.gov/radnet/radnetapi/v1';

export interface RadiationReading {
  id: string;
  value: number;
  unit: 'cpm' | 'usv' | 'cgy';
  location: {
    lat: number;
    lon: number;
    name: string;
  };
  timestamp: string;
  source: 'safecast' | 'epa';
}

export interface RadiationSite {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: 'active' | 'inactive';
  latestValue?: number;
  trend: 'stable' | 'rising' | 'falling';
}

export interface RadiationData {
  sites: RadiationSite[];
  readings: RadiationReading[];
  alertLevel: 'normal' | 'elevated' | 'high';
  lastUpdate: string;
  sourcesOnline: number;
}

const NUCLEAR_SITES = [
  { id: 'fukushima', name: 'Fukushima', lat: 37.42, lon: 141.03 },
  { id: 'chernobyl', name: 'Chernobyl', lat: 51.39, lon: 30.09 },
  { id: 'sellafield', name: 'Sellafield', lat: 54.21, lon: -3.48 },
  { id: 'palisades', name: 'Palisades (MI)', lat: 42.32, lon: -86.31 },
];

const breaker = createCircuitBreaker<RadiationData>({ name: 'Radiation' });

async function fetchSafecast(): Promise<RadiationReading[]> {
  try {
    const resp = await fetch(`${SAFECAST_API}?duration=3600&limit=100`);
    const data = await resp.json();
    return (data.measurements || []).map((m: any) => ({
      id: String(m.id),
      value: m.value,
      unit: m.unit || 'cpm',
      location: { lat: m.latitude, lon: m.longitude, name: m.location || 'Unknown' },
      timestamp: m.created_at,
      source: 'safecast' as const,
    }));
  } catch {
    return [];
  }
}

async function fetchEPARadNet(): Promise<RadiationReading[]> {
  try {
    const resp = await fetch(`${EPA_RADNET_API}/readings?format=json`);
    const data = await resp.json();
    return (data.Readings || []).map((r: any) => ({
      id: String(r.id),
      value: r.value,
      unit: r.unit || 'cpm',
      location: { lat: r.latitude, lon: r.longitude, name: r.siteName || 'EPA Site' },
      timestamp: r.date,
      source: 'epa' as const,
    }));
  } catch {
    return [];
  }
}

export async function fetchRadiationData(): Promise<RadiationData> {
  const [safecast, epa] = await Promise.all([fetchSafecast(), fetchEPARadNet()]);
  const allReadings = [...safecast, ...epa];
  
  const sites: RadiationSite[] = NUCLEAR_SITES.map(site => {
    const siteReadings = allReadings.filter(r => 
      Math.abs(r.location.lat - site.lat) < 1 && 
      Math.abs(r.location.lon - site.lon) < 1
    );
    const latestValue = siteReadings[0]?.value;
    
    return {
      id: site.id,
      name: site.name,
      lat: site.lat,
      lon: site.lon,
      status: siteReadings.length > 0 ? 'active' : 'inactive',
      latestValue,
      trend: 'stable' as const,
    };
  });
  
  const avgValue = allReadings.length > 0 
    ? allReadings.reduce((a, b) => a + b.value, 0) / allReadings.length 
    : 0;
  
  let alertLevel: 'normal' | 'elevated' | 'high' = 'normal';
  if (avgValue > 100) alertLevel = 'high';
  else if (avgValue > 50) alertLevel = 'elevated';
  
  return {
    sites,
    readings: allReadings.slice(0, 50),
    alertLevel,
    lastUpdate: new Date().toISOString(),
    sourcesOnline: (safecast.length > 0 ? 1 : 0) + (epa.length > 0 ? 1 : 0),
  };
}

export function isRadiationConfigured(): boolean {
  return isFeatureAvailable('radiation');
}
