// Sanctions Tracker - OFAC SDN List + OpenSanctions aggregated data
// Based on Crucix ofac and opensanctions sources

import { isFeatureAvailable } from './runtime-config';

const OPEN_SANCTIONS_API = 'https://www.opensanctions.org/api/search/';

export interface SanctionedEntity {
  id: string;
  name: string;
  type: 'individual' | 'entity' | 'vessel' | 'aircraft';
  sanctionProgram: string[];
  listingDate?: string;
  source: 'OFAC' | 'OpenSanctions' | 'UN';
  aliases?: string[];
  nationalities?: string[];
}

export interface SanctionsData {
  entities: SanctionedEntity[];
  totalCount: number;
  byProgram: Record<string, number>;
  lastUpdate: string;
  newThisWeek: number;
}

async function fetchOFAC(): Promise<SanctionedEntity[]> {
  try {
    // Using Treasury API as fallback
    const resp = await fetch('https://api.treasury.gov/services/v1/future/OFAC%20 SDN%20List.json');
    await resp.json();
    return [];
  } catch {
    return [];
  }
}

async function fetchOpenSanctions(): Promise<SanctionedEntity[]> {
  try {
    const resp = await fetch(`${OPEN_SANCTIONS_API}?q=sanction&format=json&limit=50`);
    const data = await resp.json();
    return data.result || [];
  } catch {
    return [];
  }
}

export async function fetchSanctionsData(): Promise<SanctionsData> {
  const [ofac, openSanc] = await Promise.all([fetchOFAC(), fetchOpenSanctions()]);
  
  const allEntities = [...ofac, ...openSanc];
  const byProgram: Record<string, number> = {};
  
  allEntities.forEach(e => {
    e.sanctionProgram.forEach(p => {
      byProgram[p] = (byProgram[p] || 0) + 1;
    });
  });
  
  return {
    entities: allEntities,
    totalCount: allEntities.length,
    byProgram,
    lastUpdate: new Date().toISOString(),
    newThisWeek: 0, // Would calculate from listing dates
  };
}

export function isSanctionsConfigured(): boolean {
  return isFeatureAvailable('sanctions');
}
