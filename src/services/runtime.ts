const DEFAULT_REMOTE_HOSTS: Record<string, string> = {
  tech: 'https://tech.worldmonitor.app',
  full: 'https://worldmonitor.app',
  world: 'https://worldmonitor.app',
};

type RuntimeProbe = {
  hasTauriGlobals: boolean;
  userAgent: string;
  locationProtocol: string;
  locationHost: string;
  locationOrigin: string;
};

export function detectDesktopRuntime(_probe: RuntimeProbe): boolean {
  return false;
}

export function isDesktopRuntime(): boolean {
  return false;
}

export function getApiBaseUrl(): string {
  return '';
}

export function getRemoteApiBaseUrl(): string {
  const variant = import.meta.env.VITE_VARIANT || 'full';
  return DEFAULT_REMOTE_HOSTS[variant] ?? DEFAULT_REMOTE_HOSTS.full ?? 'https://worldmonitor.app';
}

export function toRuntimeUrl(path: string): string {
  return path;
}

export function installRuntimeFetchPatch(): void {}
