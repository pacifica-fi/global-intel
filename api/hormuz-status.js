export const config = { runtime: 'edge' };

import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { getCachedJson, setCachedJson } from './_upstash-cache.js';
import { recordCacheTelemetry } from './_cache-telemetry.js';

const CACHE_TTL_SECONDS = 300; // 5 min at edge, relay caches 15 min
const CACHE_VERSION = 'v1';
const MEMORY_CACHE_MAX_AGE_MS = 10 * 60 * 1000; // 10 min stale fallback
const memoryCache = new Map();
let inFlight = null;

function getRelayBaseUrl() {
  const relayUrl = process.env.WS_RELAY_URL;
  if (!relayUrl) return null;
  return relayUrl
    .replace('wss://', 'https://')
    .replace('ws://', 'http://')
    .replace(/\/$/, '');
}

function isValid(data) {
  return Boolean(data && typeof data === 'object' && data.fetchedAt);
}

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    if (isDisallowedOrigin(req)) return new Response(null, { status: 403, headers: corsHeaders });
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const cacheKey = `hormuz-status:${CACHE_VERSION}`;

  // Redis cache
  const redisCached = await getCachedJson(cacheKey);
  if (isValid(redisCached)) {
    recordCacheTelemetry('/api/hormuz-status', 'REDIS-HIT');
    return new Response(JSON.stringify(redisCached), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`, 'X-Cache': 'REDIS-HIT', ...corsHeaders },
    });
  }

  // Memory cache
  const memEntry = memoryCache.get(cacheKey);
  if (memEntry) {
    const age = Date.now() - memEntry.timestamp;
    if (age < MEMORY_CACHE_MAX_AGE_MS && isValid(memEntry.data)) {
      recordCacheTelemetry('/api/hormuz-status', 'MEMORY-HIT');
      return new Response(JSON.stringify(memEntry.data), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`, 'X-Cache': 'MEMORY-HIT', ...corsHeaders },
      });
    }
    memoryCache.delete(cacheKey);
  }

  const relayBaseUrl = getRelayBaseUrl();
  if (!relayBaseUrl) {
    return new Response(JSON.stringify({ error: 'Relay not configured' }), {
      status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    if (!inFlight) {
      inFlight = (async () => {
        const upstreamUrl = `${relayBaseUrl}/hormuz-status`;
        const response = await fetch(upstreamUrl, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error(`Relay HTTP ${response.status}`);
        const data = await response.json();
        if (!isValid(data)) throw new Error('Invalid payload');
        return data;
      })();
    }
    const data = await inFlight;
    memoryCache.set(cacheKey, { data, timestamp: Date.now() });
    void setCachedJson(cacheKey, data, CACHE_TTL_SECONDS);
    recordCacheTelemetry('/api/hormuz-status', 'MISS');
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`, 'X-Cache': 'MISS', ...corsHeaders },
    });
  } catch (error) {
    // Stale fallback
    const stale = memoryCache.get(cacheKey);
    if (stale && isValid(stale.data)) {
      recordCacheTelemetry('/api/hormuz-status', 'MEMORY-ERROR-FALLBACK');
      return new Response(JSON.stringify(stale.data), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=60`, 'X-Cache': 'MEMORY-ERROR-FALLBACK', ...corsHeaders },
      });
    }
    recordCacheTelemetry('/api/hormuz-status', 'ERROR');
    return new Response(JSON.stringify({ error: error.message || 'Fetch failed' }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } finally {
    inFlight = null;
  }
}
