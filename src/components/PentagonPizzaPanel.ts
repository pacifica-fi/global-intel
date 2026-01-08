import { Panel } from './Panel';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { t } from '@/services/i18n';

interface PizzaHistoryPoint {
  current_popularity: number | null;
}

interface PizzaPlace {
  place_id: string;
  name: string;
  address: string;
  current_popularity: number | null;
  percentage_of_usual: number | null;
  is_spike: boolean;
  data_freshness: string;
  sparkline_24h?: PizzaHistoryPoint[];
}

interface PizzaApiResponse {
  success: boolean;
  data: PizzaPlace[];
  overall_index: number;
  defcon_level: number;
  active_spikes: number;
  timestamp: string;
  data_freshness: string;
  defcon_details?: {
    open_places?: number;
    total_places?: number;
  };
}

const API_ENDPOINTS = [
  '/api/pizzint-dashboard',
  '/api/pizzint/dashboard-data',
  'https://www.pizzint.watch/api/dashboard-data',
];
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function buildRequestUrl(baseUrl: string): string {
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}_t=${Date.now()}`;
}

function toNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return value;
}

function statusClass(place: PizzaPlace): string {
  if (place.current_popularity === null) return 'pizza-status-closed';
  if (place.is_spike) return 'pizza-status-spike';
  if (place.current_popularity >= 70) return 'pizza-status-high';
  if (place.current_popularity >= 40) return 'pizza-status-elevated';
  return 'pizza-status-normal';
}

function statusLabel(place: PizzaPlace): string {
  if (place.current_popularity === null) return 'Closed';
  if (place.is_spike) return `Spike ${place.current_popularity}%`;
  return `${place.current_popularity}%`;
}

function sparklineSvg(points: PizzaHistoryPoint[] | undefined): string {
  if (!points || points.length < 2) return '';
  const values = points
    .map((point) => toNumber(point.current_popularity))
    .filter((value): value is number => value !== null);
  if (values.length < 2) return '';
  const width = 90;
  const height = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const step = width / Math.max(1, values.length - 1);
  const d = values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return `<svg class="pizza-sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="${d}" /></svg>`;
}

function formatUpdatedAt(isoTime: string): string {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
}

export class PentagonPizzaPanel extends Panel {
  private data: PizzaApiResponse | null = null;
  private loading = true;
  private error: string | null = null;
  private requestInFlight = false;

  constructor() {
    super({ id: 'pentagon-pizza', title: 'Pentagon Pizza Index', showCount: true });
    void this.fetchData();
    setInterval(() => {
      void this.fetchData();
    }, REFRESH_INTERVAL_MS);
  }

  public async fetchData(): Promise<void> {
    if (this.requestInFlight) return;
    this.requestInFlight = true;
    try {
      let payload: Partial<PizzaApiResponse> | null = null;
      let lastError: Error | null = null;

      for (const endpoint of API_ENDPOINTS) {
        try {
          const response = await fetch(buildRequestUrl(endpoint), { cache: 'no-store' });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const json = await response.json() as Partial<PizzaApiResponse>;
          if (!json.success || !Array.isArray(json.data)) {
            throw new Error('Invalid PizzINT response');
          }
          payload = json;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Request failed');
        }
      }

      if (!payload) {
        throw lastError || new Error('No available PizzINT endpoint');
      }

      const places = Array.isArray(payload.data) ? payload.data : [];
      const nextData: PizzaApiResponse = {
        success: true,
        data: places,
        overall_index: typeof payload.overall_index === 'number' ? payload.overall_index : 0,
        defcon_level: typeof payload.defcon_level === 'number' ? payload.defcon_level : 5,
        active_spikes: typeof payload.active_spikes === 'number' ? payload.active_spikes : 0,
        timestamp: typeof payload.timestamp === 'string' ? payload.timestamp : new Date().toISOString(),
        data_freshness: typeof payload.data_freshness === 'string' ? payload.data_freshness : 'unknown',
        defcon_details: payload.defcon_details,
      };
      this.data = nextData;
      this.error = null;
      this.loading = false;
      this.setCount(nextData.data.length);
      this.renderPanel();
    } catch (error) {
      this.loading = false;
      this.error = error instanceof Error ? error.message : t('common.failedToLoad');
      this.renderPanel();
    } finally {
      this.requestInFlight = false;
    }
  }

  private renderPanel(): void {
    if (this.loading) {
      this.showLoading('Loading Pentagon Pizza Index...');
      return;
    }
    if (this.error || !this.data) {
      this.showError(this.error || t('common.noDataShort'));
      return;
    }

    const openPlaces = this.data.defcon_details?.open_places ?? this.data.data.filter((place) => place.current_popularity !== null).length;
    const totalPlaces = this.data.defcon_details?.total_places ?? this.data.data.length;
    const sortedPlaces = [...this.data.data].sort((a, b) => (toNumber(b.current_popularity) ?? -1) - (toNumber(a.current_popularity) ?? -1));
    const topPlaces = sortedPlaces.slice(0, 10);
    const freshness = this.data.data_freshness.toUpperCase();

    const html = `
      <div class="pizza-panel-wrap">
        <div class="pizza-summary-grid">
          <div class="pizza-summary-card">
            <span class="pizza-summary-label">DEFCON</span>
            <span class="pizza-summary-value pizza-defcon-${Math.min(5, Math.max(1, this.data.defcon_level))}">${this.data.defcon_level}</span>
          </div>
          <div class="pizza-summary-card">
            <span class="pizza-summary-label">Index</span>
            <span class="pizza-summary-value">${this.data.overall_index}</span>
          </div>
          <div class="pizza-summary-card">
            <span class="pizza-summary-label">Active Spikes</span>
            <span class="pizza-summary-value">${this.data.active_spikes}</span>
          </div>
          <div class="pizza-summary-card">
            <span class="pizza-summary-label">Open / Total</span>
            <span class="pizza-summary-value">${openPlaces}/${totalPlaces}</span>
          </div>
        </div>
        <div class="pizza-meta-row">
          <span>${escapeHtml(freshness)}</span>
          <span>${escapeHtml(formatUpdatedAt(this.data.timestamp))}</span>
        </div>
        <div class="pizza-places-list">
          ${topPlaces.map((place) => `
            <div class="pizza-place-row">
              <div class="pizza-place-main">
                <a class="pizza-place-name" href="${sanitizeUrl(place.address)}" target="_blank" rel="noopener noreferrer">${escapeHtml(place.name)}</a>
                <span class="pizza-place-status ${statusClass(place)}">${escapeHtml(statusLabel(place))}</span>
              </div>
              <div class="pizza-place-sub">
                <span class="pizza-place-usual">${place.percentage_of_usual === null ? 'usual N/A' : `usual ${place.percentage_of_usual}%`}</span>
                ${sparklineSvg(place.sparkline_24h)}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    this.setContent(html);
  }
}
