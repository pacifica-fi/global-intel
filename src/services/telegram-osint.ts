// Telegram OSINT - Curated intelligence channels for conflict zones and geopolitics
// Based on Crucix telegram source pattern

import { isFeatureAvailable } from './runtime-config';

const OSINT_CHANNELS = [
  // Ukraine/Russia
  { id: 'intelslava', label: 'Intel Slava Z', topic: 'conflict' },
  { id: 'legitimniy', label: 'Legitimniy', topic: 'conflict' },
  { id: 'wartranslated', label: 'War Translated', topic: 'conflict' },
  { id: 'ukraine_frontline', label: 'Ukraine Frontline', topic: 'conflict' },
  { id: 'DeepStateUA', label: 'DeepState Ukraine', topic: 'conflict' },
  // Middle East
  { id: 'middleeastosint', label: 'Middle East OSINT', topic: 'osint' },
  // Geopolitics
  { id: 'geaborning', label: 'Geo A. Borning', topic: 'geopolitics' },
  // Markets
  { id: 'WallStreetSilver', label: 'Wall St Silver', topic: 'finance' },
  { id: 'unusual_whales', label: 'Unusual Whales', topic: 'finance' },
];

export interface TelegramOsintItem {
  channel: string;
  label: string;
  topic: string;
  text: string;
  date: string;
  views: number;
  urgent: boolean;
}

export interface TelegramOsintData {
  items: TelegramOsintItem[];
  channels: number;
  lastUpdate: string;
}

export async function fetchTelegramOsint(): Promise<TelegramOsintData> {
  return {
    items: [],
    channels: OSINT_CHANNELS.length,
    lastUpdate: new Date().toISOString(),
  };
}

export function isTelegramConfigured(): boolean {
  return isFeatureAvailable('telegramOsint');
}
