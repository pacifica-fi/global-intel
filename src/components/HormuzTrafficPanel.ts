/**
 * Strait of Hormuz Traffic Panel
 * Embedded MapLibre GL map with CARTO dark tiles.
 * Vessels rendered as circle markers via GeoJSON source.
 */
import maplibregl from 'maplibre-gl';
import { Panel } from './Panel';
import { t } from '@/services/i18n';
import {
  initHormuzTracking,
  getHormuzVessels,
  getHormuzStats,
  disconnectHormuzTracking,
  type HormuzVessel,
  type HormuzTrafficStats,
} from '@/services/hormuz-traffic';
import { isAisConfigured } from '@/services/ais';
import type { MapContainer } from './MapContainer';

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const SRC_ID = 'hormuz-vessels-src';
const DOT_LAYER = 'hormuz-vessels-dots';
const GLOW_LAYER = 'hormuz-vessels-glow';

const VESSEL_COLORS: Record<string, string> = {
  tanker: '#ff6b35',
  cargo: '#4ecdc4',
  passenger: '#45b7d1',
  military: '#c084fc',
  other: '#94a3b8',
};

export class HormuzTrafficPanel extends Panel {
  private mapEl: HTMLElement | null = null;
  private map: maplibregl.Map | null = null;
  private statsEl: HTMLElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private mapLoaded = false;
  private didFit = false;

  constructor(_mapContainer?: MapContainer) {
    super({
      id: 'hormuz-traffic',
      title: t('panels.hormuzTraffic') || 'Strait of Hormuz Traffic',
      showCount: true,
      trackActivity: true,
      infoTooltip: `<strong>Strait of Hormuz Traffic</strong>
        Real-time vessel positions via AIS in the Strait of Hormuz.
        <ul>
          <li>Orange = Tankers</li>
          <li>Teal = Cargo</li>
          <li>Blue = Passenger</li>
          <li>Purple = Military</li>
        </ul>`,
    });

    this.getElement().classList.add('col-span-2', 'span-3', 'resized');
    this.init();
  }

  private init(): void {
    this.buildUI();
    if (isAisConfigured()) initHormuzTracking();
    this.timer = setInterval(() => this.refresh(), 10_000);
    setTimeout(() => this.refresh(), 2000);
  }

  private buildUI(): void {
    const wrap = document.createElement('div');
    wrap.className = 'hormuz-traffic-map';

    this.mapEl = document.createElement('div');
    this.mapEl.className = 'hormuz-traffic-maplibre';
    wrap.appendChild(this.mapEl);

    // Legend
    const legend = document.createElement('div');
    legend.className = 'hormuz-traffic-legend';
    legend.innerHTML = Object.entries(VESSEL_COLORS)
      .map(([type, color]) => {
        const label = t(`panels.hormuzVesselTypes.${type}`) || type;
        return `<span class="hormuz-legend-item"><span class="hormuz-legend-dot" style="background:${color}"></span>${label}</span>`;
      }).join('');
    wrap.appendChild(legend);

    this.statsEl = document.createElement('div');
    this.statsEl.className = 'hormuz-traffic-stats';

    this.content.innerHTML = '';
    this.content.appendChild(wrap);
    this.content.appendChild(this.statsEl);

    requestAnimationFrame(() => this.createMap());
  }

  private createMap(): void {
    if (!this.mapEl) return;
    try {
      const m = new maplibregl.Map({
        container: this.mapEl,
        style: DARK_STYLE,
        center: [55.3, 25.3],
        zoom: 8,
        attributionControl: false,
        interactive: true,
        trackResize: true,
        minZoom: 4,
        maxZoom: 14,
      });

      m.on('load', () => {
        // Add source with a test point to verify rendering
        m.addSource(SRC_ID, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: { category: 'tanker' },
              geometry: { type: 'Point', coordinates: [55.3, 25.3] },
            }],
          },
        });

        // Find a good layer to insert before (first symbol/label layer)
        const style = m.getStyle();
        const layers = style?.layers ?? [];
        let beforeId: string | undefined;
        for (const layer of layers) {
          if (layer.type === 'symbol') {
            beforeId = layer.id;
            break;
          }
        }

        // Glow
        m.addLayer({
          id: GLOW_LAYER,
          type: 'circle',
          source: SRC_ID,
          paint: {
            'circle-radius': 8,
            'circle-color': 'rgba(255,107,53,0.25)',
            'circle-blur': 0.8,
          },
        }, beforeId);

        // Dots
        m.addLayer({
          id: DOT_LAYER,
          type: 'circle',
          source: SRC_ID,
          paint: {
            'circle-radius': 4,
            'circle-color': [
              'match', ['get', 'category'],
              'tanker', '#ff6b35',
              'cargo', '#4ecdc4',
              'passenger', '#45b7d1',
              'military', '#c084fc',
              '#94a3b8',
            ] as any,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255,255,255,0.5)',
          },
        }, beforeId);

        this.map = m;
        this.mapLoaded = true;

        // Now pull real data
        this.refresh();
      });
    } catch {
      if (this.mapEl) {
        this.mapEl.innerHTML = '<div class="hormuz-map-fallback">Map unavailable</div>';
      }
    }
  }

  private refresh(): void {
    const stats = getHormuzStats();
    const vessels = getHormuzVessels();
    this.setCount(stats.total);
    this.drawStats(stats);
    if (this.mapLoaded && this.map) {
      this.updateVessels(vessels);
    }
  }

  private updateVessels(vessels: HormuzVessel[]): void {
    if (!this.map) return;

    const features = vessels.map(v => ({
      type: 'Feature' as const,
      properties: { category: v.category },
      geometry: { type: 'Point' as const, coordinates: [v.lon, v.lat] as [number, number] },
    }));

    const src = this.map.getSource(SRC_ID) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData({ type: 'FeatureCollection', features });
    }

    // Auto-fit on first data
    if (!this.didFit && vessels.length > 0) {
      this.didFit = true;
      this.fitToVessels(vessels);
    }

    // No-data watermark
    const noData = this.mapEl?.querySelector('.hormuz-no-data');
    if (vessels.length === 0 && !noData) {
      const el = document.createElement('div');
      el.className = 'hormuz-no-data';
      el.textContent = isAisConfigured()
        ? (t('panels.hormuzNoData') || 'Waiting for vessel data...')
        : (t('panels.hormuzAisNotConfigured') || 'AIS not configured');
      this.mapEl?.appendChild(el);
    } else if (vessels.length > 0 && noData) {
      noData.remove();
    }
  }

  private fitToVessels(vessels: HormuzVessel[]): void {
    if (!this.map || vessels.length === 0) return;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const v of vessels) {
      if (v.lat < minLat) minLat = v.lat;
      if (v.lat > maxLat) maxLat = v.lat;
      if (v.lon < minLon) minLon = v.lon;
      if (v.lon > maxLon) maxLon = v.lon;
    }
    const pad = 0.3;
    this.map.fitBounds(
      [[minLon - pad, minLat - pad], [maxLon + pad, maxLat + pad]],
      { padding: 30, duration: 500, maxZoom: 11 },
    );
  }

  private drawStats(stats: HormuzTrafficStats): void {
    if (!this.statsEl) return;
    const trendIcon = stats.trend === 'up' ? '▲' : stats.trend === 'down' ? '▼' : '●';
    const trendColor = stats.trend === 'up' ? '#ff6b35' : stats.trend === 'down' ? '#4ecdc4' : '#94a3b8';
    const cc = `hormuz-congestion-${stats.congestion}`;
    const cl = t(`panels.hormuzCongestion.${stats.congestion}`) || stats.congestion;

    this.statsEl.innerHTML = `
      <div class="hormuz-stats-row">
        <span class="hormuz-stat-chip ${cc}">${cl}</span>
        <span class="hormuz-stat-total">
          ${stats.total} vessels
          <span class="hormuz-trend" style="color:${trendColor}">${trendIcon}</span>
        </span>
      </div>
      <div class="hormuz-stats-breakdown">
        ${this.chip('tanker', stats.tankers)}
        ${this.chip('cargo', stats.cargo)}
        ${this.chip('passenger', stats.passenger)}
        ${this.chip('military', stats.military)}
      </div>
      <div class="hormuz-stats-time">
        Updated ${new Date(stats.lastUpdate).toLocaleTimeString()}
      </div>`;
  }

  private chip(type: string, count: number): string {
    const color = VESSEL_COLORS[type];
    const label = t(`panels.hormuzVesselTypes.${type}`) || type;
    return `<span class="hormuz-type-chip"><span class="hormuz-type-dot" style="background:${color}"></span>${label} <strong>${count}</strong></span>`;
  }

  public setMapContainer(_mc: MapContainer): void {}
  public override destroy(): void {
    super.destroy();
    if (this.timer) clearInterval(this.timer);
    if (this.map) { this.map.remove(); this.map = null; }
    disconnectHormuzTracking();
  }
}
