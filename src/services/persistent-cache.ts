type CacheEnvelope<T> = {
  key: string;
  updatedAt: number;
  data: T;
};

const CACHE_PREFIX = 'worldmonitor-persistent-cache:';

export async function getPersistentCache<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    return raw ? JSON.parse(raw) as CacheEnvelope<T> : null;
  } catch {
    return null;
  }
}

export async function setPersistentCache<T>(key: string, data: T): Promise<void> {
  const payload: CacheEnvelope<T> = { key, data, updatedAt: Date.now() };

  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(payload));
  } catch {
    // Ignore quota errors
  }
}

export function cacheAgeMs(updatedAt: number): number {
  return Math.max(0, Date.now() - updatedAt);
}

export function describeFreshness(updatedAt: number): string {
  const age = cacheAgeMs(updatedAt);
  const mins = Math.floor(age / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
