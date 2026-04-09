export type RuntimeSecretKey =
  | 'GROQ_API_KEY'
  | 'OPENROUTER_API_KEY'
  | 'FRED_API_KEY'
  | 'EIA_API_KEY'
  | 'CLOUDFLARE_API_TOKEN'
  | 'ACLED_ACCESS_TOKEN'
  | 'URLHAUS_AUTH_KEY'
  | 'OTX_API_KEY'
  | 'ABUSEIPDB_API_KEY'
  | 'WINGBITS_API_KEY'
  | 'WS_RELAY_URL'
  | 'VITE_OPENSKY_RELAY_URL'
  | 'OPENSKY_CLIENT_ID'
  | 'OPENSKY_CLIENT_SECRET'
  | 'AISSTREAM_API_KEY'
  | 'FINNHUB_API_KEY'
  | 'NASA_FIRMS_API_KEY'
  | 'UC_DP_KEY';

export type RuntimeFeatureId =
  | 'aiGroq'
  | 'aiOpenRouter'
  | 'economicFred'
  | 'energyEia'
  | 'internetOutages'
  | 'acledConflicts'
  | 'abuseChThreatIntel'
  | 'alienvaultOtxThreatIntel'
  | 'abuseIpdbThreatIntel'
  | 'wingbitsEnrichment'
  | 'aisRelay'
  | 'openskyRelay'
  | 'finnhubMarkets'
  | 'nasaFirms'
  | 'radiation'
  | 'sanctions'
  | 'socialSentiment'
  | 'telegramOsint';

export interface RuntimeFeatureDefinition {
  id: RuntimeFeatureId;
  name: string;
  description: string;
  requiredSecrets: RuntimeSecretKey[];
  fallback: string;
}

export interface RuntimeSecretState {
  value: string;
  source: 'env' | 'vault';
}

export interface RuntimeConfig {
  featureToggles: Record<RuntimeFeatureId, boolean>;
  secrets: Partial<Record<RuntimeSecretKey, RuntimeSecretState>>;
}

const TOGGLES_STORAGE_KEY = 'worldmonitor-runtime-feature-toggles';

const defaultToggles: Record<RuntimeFeatureId, boolean> = {
  aiGroq: true,
  aiOpenRouter: true,
  economicFred: true,
  energyEia: true,
  internetOutages: true,
  acledConflicts: true,
  abuseChThreatIntel: true,
  alienvaultOtxThreatIntel: true,
  abuseIpdbThreatIntel: true,
  wingbitsEnrichment: true,
  aisRelay: true,
  openskyRelay: true,
  finnhubMarkets: true,
  nasaFirms: true,
  radiation: true,
  sanctions: true,
  socialSentiment: true,
  telegramOsint: true,
};

export const RUNTIME_FEATURES: RuntimeFeatureDefinition[] = [
  {
    id: 'aiGroq',
    name: 'Groq summarization',
    description: 'Primary fast LLM provider used for AI summary generation.',
    requiredSecrets: ['GROQ_API_KEY'],
    fallback: 'Falls back to OpenRouter, then local browser model.',
  },
  {
    id: 'aiOpenRouter',
    name: 'OpenRouter summarization',
    description: 'Secondary LLM provider for AI summary fallback.',
    requiredSecrets: ['OPENROUTER_API_KEY'],
    fallback: 'Falls back to local browser model only.',
  },
  {
    id: 'economicFred',
    name: 'FRED economic indicators',
    description: 'Macro indicators from Federal Reserve Economic Data.',
    requiredSecrets: ['FRED_API_KEY'],
    fallback: 'Economic panel remains available with non-FRED metrics.',
  },
  {
    id: 'energyEia',
    name: 'EIA oil analytics',
    description: 'US Energy Information Administration oil metrics.',
    requiredSecrets: ['EIA_API_KEY'],
    fallback: 'Oil analytics cards show disabled state.',
  },
  {
    id: 'internetOutages',
    name: 'Cloudflare outage radar',
    description: 'Internet outages from Cloudflare Radar annotations API.',
    requiredSecrets: ['CLOUDFLARE_API_TOKEN'],
    fallback: 'Outage layer is disabled and map continues with other feeds.',
  },
  {
    id: 'acledConflicts',
    name: 'ACLED conflicts & protests',
    description: 'Conflict and protest event feeds from ACLED.',
    requiredSecrets: ['ACLED_ACCESS_TOKEN'],
    fallback: 'Conflict/protest overlays are hidden.',
  },
  {
    id: 'abuseChThreatIntel',
    name: 'abuse.ch cyber IOC feeds',
    description: 'URLhaus and ThreatFox IOC ingestion for the cyber threat layer.',
    requiredSecrets: ['URLHAUS_AUTH_KEY'],
    fallback: 'URLhaus/ThreatFox IOC ingestion is disabled.',
  },
  {
    id: 'alienvaultOtxThreatIntel',
    name: 'AlienVault OTX threat intel',
    description: 'Optional OTX IOC ingestion for cyber threat enrichment.',
    requiredSecrets: ['OTX_API_KEY'],
    fallback: 'OTX IOC enrichment is disabled.',
  },
  {
    id: 'abuseIpdbThreatIntel',
    name: 'AbuseIPDB threat intel',
    description: 'Optional AbuseIPDB IOC/reputation enrichment for the cyber threat layer.',
    requiredSecrets: ['ABUSEIPDB_API_KEY'],
    fallback: 'AbuseIPDB enrichment is disabled.',
  },
  {
    id: 'wingbitsEnrichment',
    name: 'Wingbits aircraft enrichment',
    description: 'Military flight operator/aircraft enrichment metadata.',
    requiredSecrets: ['WINGBITS_API_KEY'],
    fallback: 'Flight map still renders with heuristic-only classification.',
  },
  {
    id: 'aisRelay',
    name: 'AIS vessel tracking',
    description: 'Live vessel ingestion via AISStream WebSocket.',
    requiredSecrets: ['WS_RELAY_URL', 'AISSTREAM_API_KEY'],
    fallback: 'AIS layer is disabled.',
  },
  {
    id: 'openskyRelay',
    name: 'OpenSky military flights',
    description: 'OpenSky OAuth credentials for military flight data.',
    requiredSecrets: ['VITE_OPENSKY_RELAY_URL', 'OPENSKY_CLIENT_ID', 'OPENSKY_CLIENT_SECRET'],
    fallback: 'Military flights fall back to limited/no data.',
  },
  {
    id: 'finnhubMarkets',
    name: 'Finnhub market data',
    description: 'Real-time stock quotes and market data from Finnhub.',
    requiredSecrets: ['FINNHUB_API_KEY'],
    fallback: 'Stock ticker uses limited free data.',
  },
  {
    id: 'nasaFirms',
    name: 'NASA FIRMS fire data',
    description: 'Fire Information for Resource Management System satellite data.',
    requiredSecrets: ['NASA_FIRMS_API_KEY'],
    fallback: 'FIRMS fire layer uses public VIIRS feed.',
  },
  {
    id: 'radiation',
    name: 'Radiation monitoring',
    description: 'Safecast and EPA RadNet radiation monitoring.',
    requiredSecrets: [],
    fallback: 'Radiation panel is disabled.',
  },
  {
    id: 'sanctions',
    name: 'Sanctions tracking',
    description: 'OFAC and OpenSanctions aggregated sanctions tracking.',
    requiredSecrets: [],
    fallback: 'Sanctions panel is disabled.',
  },
  {
    id: 'socialSentiment',
    name: 'Social sentiment',
    description: 'Reddit and Bluesky sentiment signal sampling.',
    requiredSecrets: [],
    fallback: 'Social sentiment panel is disabled.',
  },
  {
    id: 'telegramOsint',
    name: 'Telegram OSINT',
    description: 'Curated Telegram OSINT channel list.',
    requiredSecrets: [],
    fallback: 'Telegram OSINT panel is disabled.',
  },
];

function readEnvSecret(key: RuntimeSecretKey): string {
  const envValue = (import.meta as { env?: Record<string, unknown> }).env?.[key];
  return typeof envValue === 'string' ? envValue.trim() : '';
}

function readStoredToggles(): Record<RuntimeFeatureId, boolean> {
  try {
    const stored = localStorage.getItem(TOGGLES_STORAGE_KEY);
    if (!stored) return { ...defaultToggles };
    const parsed = JSON.parse(stored) as Partial<Record<RuntimeFeatureId, boolean>>;
    return { ...defaultToggles, ...parsed };
  } catch {
    return { ...defaultToggles };
  }
}

const URL_SECRET_KEYS = new Set<RuntimeSecretKey>([
  'WS_RELAY_URL',
  'VITE_OPENSKY_RELAY_URL',
]);

export interface SecretVerificationResult {
  valid: boolean;
  message: string;
}

export function validateSecret(key: RuntimeSecretKey, value: string): { valid: boolean; hint?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, hint: 'Value is required' };

  if (URL_SECRET_KEYS.has(key)) {
    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
        return { valid: false, hint: 'Must be an http(s) or ws(s) URL' };
      }
      return { valid: true };
    } catch {
      return { valid: false, hint: 'Must be a valid URL' };
    }
  }

  return { valid: true };
}

const listeners = new Set<() => void>();

const runtimeConfig: RuntimeConfig = {
  featureToggles: readStoredToggles(),
  secrets: {},
};

function notifyConfigChanged(): void {
  for (const listener of listeners) listener();
}

function seedSecretsFromEnvironment(): void {
  const keys = new Set<RuntimeSecretKey>(RUNTIME_FEATURES.flatMap(feature => feature.requiredSecrets));
  for (const key of keys) {
    const value = readEnvSecret(key);
    if (value) {
      runtimeConfig.secrets[key] = { value, source: 'env' };
    }
  }
}

seedSecretsFromEnvironment();

// Listen for cross-window state updates (settings ↔ main).
// When one window saves secrets or toggles features, the `storage` event fires in other same-origin windows.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === TOGGLES_STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue) as Partial<Record<RuntimeFeatureId, boolean>>;
        Object.assign(runtimeConfig.featureToggles, parsed);
        notifyConfigChanged();
      } catch { /* ignore malformed JSON */ }
    }
  });
}

export function subscribeRuntimeConfig(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRuntimeConfigSnapshot(): RuntimeConfig {
  return {
    featureToggles: { ...runtimeConfig.featureToggles },
    secrets: { ...runtimeConfig.secrets },
  };
}

export function isFeatureEnabled(featureId: RuntimeFeatureId): boolean {
  return runtimeConfig.featureToggles[featureId] !== false;
}

export function getSecretState(key: RuntimeSecretKey): { present: boolean; valid: boolean; source: 'env' | 'vault' | 'missing' } {
  const state = runtimeConfig.secrets[key];
  if (!state) return { present: false, valid: false, source: 'missing' };
  return { present: true, valid: validateSecret(key, state.value).valid, source: state.source };
}

export function isFeatureAvailable(featureId: RuntimeFeatureId): boolean {
  return isFeatureEnabled(featureId);
}

export function getEffectiveSecrets(feature: RuntimeFeatureDefinition): RuntimeSecretKey[] {
  return feature.requiredSecrets;
}

export function setFeatureToggle(featureId: RuntimeFeatureId, enabled: boolean): void {
  runtimeConfig.featureToggles[featureId] = enabled;
  localStorage.setItem(TOGGLES_STORAGE_KEY, JSON.stringify(runtimeConfig.featureToggles));
  notifyConfigChanged();
}

export async function setSecretValue(key: RuntimeSecretKey, value: string): Promise<void> {
  const sanitized = value.trim();
  if (sanitized) {
    runtimeConfig.secrets[key] = { value: sanitized, source: 'env' };
  } else {
    delete runtimeConfig.secrets[key];
  }
  notifyConfigChanged();
}

export async function verifySecretWithApi(
  key: RuntimeSecretKey,
  value: string,
  _context: Partial<Record<RuntimeSecretKey, string>> = {},
): Promise<SecretVerificationResult> {
  const localValidation = validateSecret(key, value);
  if (!localValidation.valid) {
    return { valid: false, message: localValidation.hint || 'Invalid value' };
  }

  return { valid: true, message: 'Saved' };
}
