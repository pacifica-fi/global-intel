export const config = { runtime: 'edge' };

import { getCachedJson, hashString, setCachedJson } from './_upstash-cache.js';
import { recordCacheTelemetry } from './_cache-telemetry.js';
import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

const ALLOWED_CURRENCIES = ['usd', 'eur', 'gbp', 'jpy', 'cny', 'btc', 'eth'];
const MAX_COIN_IDS = 20;
const COIN_ID_PATTERN = /^[a-z0-9-]+$/;

const CACHE_TTL_SECONDS = 120; // 2 minutes
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000;
const RESPONSE_CACHE_CONTROL = 'public, max-age=120, s-maxage=120, stale-while-revalidate=60';
const CACHE_VERSION = 'v2';
const BINANCE_SYMBOL_MAP = {
  bitcoin: 'BTCUSDT',
  ethereum: 'ETHUSDT',
  solana: 'SOLUSDT',
  binancecoin: 'BNBUSDT',
  ripple: 'XRPUSDT',
  cardano: 'ADAUSDT',
};

// In-memory fallback cache for the current instance.
let fallbackCache = { key: '', payload: null, timestamp: 0 };

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseIds(ids) {
  return ids.split(',').map((id) => id.trim().toLowerCase()).filter(Boolean);
}

function buildSimplePriceResponse(items, include24hrChange) {
  const result = {};
  for (const item of items) {
    result[item.id] = {
      usd: item.price,
      usd_24h_change: include24hrChange === 'true' ? item.change24h : undefined,
    };
  }
  return result;
}

async function fetchFromBinance(ids, endpoint, include24hrChange) {
  const requested = ids
    .map((id) => ({ id, symbol: BINANCE_SYMBOL_MAP[id] }))
    .filter((entry) => Boolean(entry.symbol));
  if (requested.length === 0) return null;

  const symbols = requested.map((entry) => entry.symbol);
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;

  const payload = await response.json();
  if (!Array.isArray(payload)) return null;

  const bySymbol = new Map(payload.map((row) => [row.symbol, row]));
  const items = requested
    .map(({ id, symbol }) => {
      const row = bySymbol.get(symbol);
      if (!row) return null;
      return {
        id,
        price: safeNumber(row.lastPrice),
        change24h: safeNumber(row.priceChangePercent),
      };
    })
    .filter((item) => item && item.price > 0);

  if (items.length === 0) return null;
  if (endpoint === 'markets') {
    return items.map((item) => ({
      id: item.id,
      current_price: item.price,
      price_change_percentage_24h: item.change24h,
      sparkline_in_7d: { price: [] },
    }));
  }
  return buildSimplePriceResponse(items, include24hrChange);
}

async function fetchFromCoinCap(ids, endpoint, include24hrChange) {
  if (ids.length === 0) return null;
  const url = `https://api.coincap.io/v2/assets?ids=${encodeURIComponent(ids.join(','))}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;

  const payload = await response.json();
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const items = rows
    .map((row) => ({
      id: row.id,
      price: safeNumber(row.priceUsd),
      change24h: safeNumber(row.changePercent24Hr),
    }))
    .filter((item) => item.id && item.price > 0);

  if (items.length === 0) return null;
  if (endpoint === 'markets') {
    return items.map((item) => ({
      id: item.id,
      current_price: item.price,
      price_change_percentage_24h: item.change24h,
      sparkline_in_7d: { price: [] },
    }));
  }
  return buildSimplePriceResponse(items, include24hrChange);
}

async function fetchAlternativeData(idsParam, endpoint, vsCurrencies, include24hrChange) {
  if (vsCurrencies !== 'usd') return null;
  const ids = parseIds(idsParam);
  if (ids.length === 0) return null;

  try {
    const binanceData = await fetchFromBinance(ids, endpoint, include24hrChange);
    if (binanceData) return { source: 'BINANCE', body: JSON.stringify(binanceData) };
  } catch {}

  try {
    const coinCapData = await fetchFromCoinCap(ids, endpoint, include24hrChange);
    if (coinCapData) return { source: 'COINCAP', body: JSON.stringify(coinCapData) };
  } catch {}

  return null;
}

function validateCoinIds(idsParam) {
  if (!idsParam) return 'bitcoin,ethereum,solana';

  const ids = idsParam.split(',')
    .map(id => id.trim().toLowerCase())
    .filter(id => COIN_ID_PATTERN.test(id) && id.length <= 50)
    .slice(0, MAX_COIN_IDS);

  return ids.length > 0 ? ids.join(',') : 'bitcoin,ethereum,solana';
}

function validateCurrency(val) {
  const currency = (val || 'usd').toLowerCase();
  return ALLOWED_CURRENCIES.includes(currency) ? currency : 'usd';
}

function validateBoolean(val, defaultVal) {
  if (val === 'true' || val === 'false') return val;
  return defaultVal;
}

function getHeaders(cors, xCache, cacheControl = RESPONSE_CACHE_CONTROL) {
  return {
    'Content-Type': 'application/json',
    ...cors,
    'Cache-Control': cacheControl,
    'X-Cache': xCache,
  };
}

function isValidPayload(payload) {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    typeof payload.body === 'string' &&
    Number.isFinite(payload.status)
  );
}

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), { status: 403, headers: cors });
  }
  const url = new URL(req.url);

  const ids = validateCoinIds(url.searchParams.get('ids'));
  const vsCurrencies = validateCurrency(url.searchParams.get('vs_currencies'));
  const include24hrChange = validateBoolean(url.searchParams.get('include_24hr_change'), 'true');

  const now = Date.now();
  const cacheKey = `${ids}:${vsCurrencies}:${include24hrChange}`;
  const redisKey = `coingecko:${CACHE_VERSION}:${hashString(cacheKey)}`;

  const redisCached = await getCachedJson(redisKey);
  if (isValidPayload(redisCached)) {
    recordCacheTelemetry('/api/coingecko', 'REDIS-HIT');
    return new Response(redisCached.body, {
      status: redisCached.status,
      headers: getHeaders(cors, 'REDIS-HIT'),
    });
  }

  if (
    isValidPayload(fallbackCache.payload) &&
    fallbackCache.key === cacheKey &&
    now - fallbackCache.timestamp < CACHE_TTL_MS
  ) {
    recordCacheTelemetry('/api/coingecko', 'MEMORY-HIT');
    return new Response(fallbackCache.payload.body, {
      status: fallbackCache.payload.status,
      headers: getHeaders(cors, 'MEMORY-HIT'),
    });
  }

  const endpoint = url.searchParams.get('endpoint');

  try {
    let geckoUrl;
    if (endpoint === 'markets') {
      geckoUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${vsCurrencies}&ids=${ids}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`;
    } else {
      geckoUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=${vsCurrencies}&include_24hr_change=${include24hrChange}`;
    }
    const response = await fetch(geckoUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (
      response.status === 429 &&
      isValidPayload(fallbackCache.payload) &&
      fallbackCache.key === cacheKey
    ) {
      recordCacheTelemetry('/api/coingecko', 'STALE');
      return new Response(fallbackCache.payload.body, {
        status: fallbackCache.payload.status,
        headers: getHeaders(cors, 'STALE'),
      });
    }

    if (!response.ok) {
      const alternative = await fetchAlternativeData(ids, endpoint, vsCurrencies, include24hrChange);
      if (alternative) {
        const altPayload = { body: alternative.body, status: 200 };
        fallbackCache = { key: cacheKey, payload: altPayload, timestamp: Date.now() };
        void setCachedJson(redisKey, altPayload, CACHE_TTL_SECONDS);
        recordCacheTelemetry('/api/coingecko', `ALT-${alternative.source}`);
        return new Response(alternative.body, {
          status: 200,
          headers: getHeaders(cors, `ALT-${alternative.source}`),
        });
      }
    }

    const data = await response.text();

    // Cache successful responses
    if (response.ok) {
      const payload = { body: data, status: response.status };
      fallbackCache = { key: cacheKey, payload, timestamp: Date.now() };
      void setCachedJson(redisKey, payload, CACHE_TTL_SECONDS);
      recordCacheTelemetry('/api/coingecko', 'MISS');
    } else {
      recordCacheTelemetry('/api/coingecko', 'UPSTREAM-ERROR');
    }

    return new Response(data, {
      status: response.status,
      headers: getHeaders(cors, 'MISS'),
    });
  } catch (error) {
    const alternative = await fetchAlternativeData(ids, endpoint, vsCurrencies, include24hrChange);
    if (alternative) {
      const altPayload = { body: alternative.body, status: 200 };
      fallbackCache = { key: cacheKey, payload: altPayload, timestamp: Date.now() };
      void setCachedJson(redisKey, altPayload, CACHE_TTL_SECONDS);
      recordCacheTelemetry('/api/coingecko', `ALT-${alternative.source}`);
      return new Response(alternative.body, {
        status: 200,
        headers: getHeaders(cors, `ALT-${alternative.source}`),
      });
    }

    // Return cached data on error if available
    if (isValidPayload(fallbackCache.payload) && fallbackCache.key === cacheKey) {
      recordCacheTelemetry('/api/coingecko', 'ERROR-FALLBACK');
      return new Response(fallbackCache.payload.body, {
        status: fallbackCache.payload.status,
        headers: getHeaders(cors, 'ERROR-FALLBACK', 'public, max-age=120'),
      });
    }

    recordCacheTelemetry('/api/coingecko', 'ERROR');
    return new Response(JSON.stringify({ error: 'Failed to fetch data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
}
