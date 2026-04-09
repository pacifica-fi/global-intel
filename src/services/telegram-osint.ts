// Telegram OSINT - Curated intelligence channels for conflict zones and geopolitics
// Based on Crucix telegram source pattern

import { createCircuitBreaker } from '@/utils';
import { isFeatureAvailable } from './runtime-config';

const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN || '';
const API_BASE = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN;

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

const URGENT_KEYWORDS = [
  'breaking', 'missile', 'strike', 'explosion', 'airstrike',
  'nuclear', 'chemical', 'escalation', 'sanctions', 'blockade',
  'casualties', 'killed', 'blackout', 'cyberattack',
];

interface TelegramMessage {
  message_id: number;
  text: string;
  date: number;
  chat: { title?: string; username?: string };
  views: number;
}

interface TelegramChannel {
  id: string;
  label: string;
  topic: string;
}

const breaker = createCircuitBreaker<{ channel: TelegramChannel; messages: TelegramMessage[] }[]>({ name: 'Telegram OSINT' });

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

async function fetchChannelMessages(channelId: string): Promise<TelegramMessage[]> {
  if (!TELEGRAM_BOT_TOKEN) return [];
  
  try {
    const resp = await fetch(`${API_BASE}/getChat?chat_id=@${channelId}`);
    const data = await resp.json();
    if (!data.ok) return [];
    
    // Get recent messages
    const limit = 10;
    const msgResp = await fetch(`${API_BASE}/getChat?chat_id=@${channelId}&limit=${limit}`);
    const msgData = await msgResp.json();
    return data.result?.messages || [];
  } catch {
    return [];
  }
}

function isUrgent(text: string): boolean {
  const lower = text.toLowerCase();
  return URGENT_KEYWORDS.some(kw => lower.includes(kw));
}

export async function fetchTelegramOsint(): Promise<TelegramOsintData> {
  const results: TelegramOsintItem[] = [];
  
  const promises = OSINT_CHANNELS.map(async (ch) => {
    try {
      // Fallback to web scraping if no bot token
      const resp = await fetch(`https://t.me/s/${ch.id}`);
      const html = await resp.text();
      // Simple parsing - in production would use proper HTML parser
      return { channel: ch, messages: [] as TelegramMessage[] };
    } catch {
      return { channel: ch, messages: [] as TelegramMessage[] };
    }
  });
  
  await Promise.all(promises);
  
  return {
    items: results,
    channels: OSINT_CHANNELS.length,
    lastUpdate: new Date().toISOString(),
  };
}

export function isTelegramConfigured(): boolean {
  return isFeatureAvailable('telegramOsint');
}
