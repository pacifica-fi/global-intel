/**
 * Strait of Hormuz Traffic Panel
 * Uses an embedded MapLibre GL map with CARTO dark tiles for accurate geography.
 * Vessels are rendered as circle markers with type-based colors.
 * Includes a scrollable vessel list below the stats.
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

// CARTO dark basemap style (same as main map)
const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Unique IDs for the vessel source and layer
const VESSEL_SOURCE_ID = 'hormuz-vessels';
const VESSEL_LAYER_ID = 'hormuz-vessel-circles';
const VESSEL_GLOW_LAYER_ID = 'hormuz-vessel-glow';

// Vessel type colors (matching original palette)
const VESSEL_COLORS: Record<string, string> = {
  tanker: '#ff6b35',
  cargo: '#4ecdc4',
  passenger: '#45b7d1',
  military: '#c084fc',
  other: '#94a3b8',
};

const MAX_LIST_ITEMS = 20;

export class HormuzTrafficPanel extends Panel {
  private mapContainer: HTMLElement | null = null;
  private map: maplibregl.Map | null = null;
  private statsContainer: HTMLElement | null = null;
  private vesselListContainer: HTMLElement | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private mapReady = false;
  private hormuzMapId: string;
  private hasFittedToVessels = false;

  constructor(_mapContainer?: MapContainer) {
    super({
      id: 'hormuz-traffic',
      title: t('panels.hormuzTraffic') || 'Strait of Hormuz Traffic',
      showCount: true,
      trackActivity: true,
      infoTooltip: `<strong>Strait of Hormuz Traffic</strong>
        Real-time vessel positions via AIS in the Strait of Hormuz.
        <ul>
          <li>Orange = Tankers (oil/LNG carriers)</li>
          <li>Teal = Cargo vessels</li>
          <li>Blue = Passenger vessels</li>
          <li>Purple = Military/Law enforcement</li>
        </ul>
        Data from AISStream.io.`,
    });

    this.hormuzMapId = `hormuz-map-${Date.now()}`;

    // Default to 2x3 size
    this.getElement().classList.add('col-span-2', 'span-3', 'resized');

    this.init();
  }

  private init(): void {
    this.buildUI();

    if (isAisConfigured()) {
      initHormuzTracking();
    }

    // Refresh every 10 seconds
    this.refreshTimer = setInterval(() => this.refresh(), 10_000);
    // Initial refresh after map loads
    setTimeout(() => this.refresh(), 1500);
  }

  private buildUI(): void {
    // Map wrapper
    const mapWrap = document.createElement('div');
    mapWrap.className = 'hormuz-traffic-map';

    // MapLibre container
    this.mapContainer = document.createElement('div');
    this.mapContainer.id = this.hormuzMapId;
    this.mapContainer.className = 'hormuz-traffic-maplibre';
    mapWrap.appendChild(this.mapContainer);

    // Legend overlay
    const legend = document.createElement('div');
    legend.className = 'hormuz-traffic-legend';
    legend.innerHTML = Object.entries(VESSEL_COLORS)
      .map(([type, color]) => {
        const label = t(`panels.hormuzVesselTypes.${type}`) || type;
        return `<span class="hormuz-legend-item"><span class="hormuz-legend-dot" style="background:${color}"></span>${label}</span>`;
      })
      .join('');
    mapWrap.appendChild(legend);

    // Stats bar
    this.statsContainer = document.createElement('div');
    this.statsContainer.className = 'hormuz-traffic-stats';

    // Vessel list
    this.vesselListContainer = document.createElement('div');
    this.vesselListContainer.className = 'hormuz-vessel-list';

    this.content.innerHTML = '';
    this.content.appendChild(mapWrap);
    this.content.appendChild(this.statsContainer);
    this.content.appendChild(this.vesselListContainer);

    // Initialize MapLibre map
    requestAnimationFrame(() => this.initMap());
  }

  private initMap(): void {
    if (!this.mapContainer) return;

    try {
      this.map = new maplibregl.Map({
        container: this.mapContainer,
        style: DARK_STYLE,
        center: [55.3, 25.3], // Default to where most vessels cluster
        zoom: 8,
        attributionControl: false,
        interactive: true,
        trackResize: true,
        minZoom: 4,
        maxZoom: 14,
        maxBounds: [
          [50.0, 20.0], // SW
          [65.0, 32.0], // NE
        ],
      });

      this.map.on('load', () => {
        this.mapReady = true;
        this.addVesselLayers();
        this.refresh();
      });
    } catch {
      if (this.mapContainer) {
        this.mapContainer.innerHTML = '<div class="hormuz-map-fallback">Map unavailable</div>';
      }
    }
  }

  private addVesselLayers(): void {
    if (!this.map || !this.mapReady) return;

    this.map.addSource(VESSEL_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // Glow layer
    this.map.addLayer({
      id: VESSEL_GLOW_LAYER_ID,
      type: 'circle',
      source: VESSEL_SOURCE_ID,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          6, 5,
          9, 12,
          14, 20,
        ] as any,
        'circle-color': [
          'match', ['get', 'category'],
          'tanker', 'rgba(255,107,53,0.30)',
          'cargo', 'rgba(78,205,196,0.30)',
          'passenger', 'rgba(69,183,209,0.30)',
          'military', 'rgba(192,132,252,0.30)',
          'rgba(148,163,184,0.20)',
        ] as any,
        'circle-blur': 0.7,
      },
    });

    // Solid vessel dots
    this.map.addLayer({
      id: VESSEL_LAYER_ID,
      type: 'circle',
      source: VESSEL_SOURCE_ID,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          6, 3,
          9, 5,
          14, 10,
        ] as any,
        'circle-color': [
          'match', ['get', 'category'],
          'tanker', VESSEL_COLORS.tanker!,
          'cargo', VESSEL_COLORS.cargo!,
          'passenger', VESSEL_COLORS.passenger!,
          'military', VESSEL_COLORS.military!,
          VESSEL_COLORS.other!,
        ] as any,
        'circle-stroke-width': [
          'interpolate', ['linear'], ['zoom'],
          6, 0.5,
          10, 1.5,
        ] as any,
        'circle-stroke-color': 'rgba(255,255,255,0.4)',
      },
    });
  }

  private refresh(): void {
    const stats = getHormuzStats();
    const vessels = getHormuzVessels();
    this.setCount(stats.total);
    this.updateVessels(vessels);
    this.drawStats(stats);
    this.drawVesselList(vessels);
  }

  private updateVessels(vessels: HormuzVessel[]): void {
    if (!this.map || !this.mapReady) return;

    const features: GeoJSON.Feature[] = vessels.map((v) => ({
      type: 'Feature' as const,
      properties: {
        category: v.category,
        name: v.name,
        mmsi: v.mmsi,
        speed: v.speed ?? 0,
        heading: v.heading ?? 0,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [v.lon, v.lat],
      },
    }));

    const source = this.map.getSource(VESSEL_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features,
      });
    }

    // Auto-fit to vessel positions on first data arrival
    if (!this.hasFittedToVessels && vessels.length > 0) {
      this.hasFittedToVessels = true;
      this.fitToVessels(vessels);
    }

    // Show/hide "no data" watermark
    const noDataEl = this.mapContainer?.querySelector('.hormuz-no-data');
    if (vessels.length === 0 && !noDataEl) {
      const el = document.createElement('div');
      el.className = 'hormuz-no-data';
      el.textContent = isAisConfigured()
        ? (t('panels.hormuzNoData') || 'Waiting for vessel data...')
        : (t('panels.hormuzAisNotConfigured') || 'AIS not configured');
      this.mapContainer?.appendChild(el);
    } else if (vessels.length > 0 && noDataEl) {
      noDataEl.remove();
    }
  }

  private fitToVessels(vessels: HormuzVessel[]): void {
    if (!this.map || vessels.length === 0) return;

    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    for (const v of vessels) {
      if (v.lat < minLat) minLat = v.lat;
      if (v.lat > maxLat) maxLat = v.lat;
      if (v.lon < minLon) minLon = v.lon;
      if (v.lon > maxLon) maxLon = v.lon;
    }

    // Add padding so vessels aren't at the edge
    const latPad = Math.max((maxLat - minLat) * 0.3, 0.2);
    const lonPad = Math.max((maxLon - minLon) * 0.3, 0.2);

    this.map.fitBounds(
      [[minLon - lonPad, minLat - latPad], [maxLon + lonPad, maxLat + latPad]],
      { padding: 20, duration: 0, maxZoom: 10 },
    );
  }

  private drawStats(stats: HormuzTrafficStats): void {
    if (!this.statsContainer) return;

    const trendIcon = stats.trend === 'up' ? '▲' : stats.trend === 'down' ? '▼' : '●';
    const trendColor =
      stats.trend === 'up' ? '#ff6b35' : stats.trend === 'down' ? '#4ecdc4' : '#94a3b8';

    const congestionClass = `hormuz-congestion-${stats.congestion}`;
    const congestionLabel =
      t(`panels.hormuzCongestion.${stats.congestion}`) || stats.congestion;

    this.statsContainer.innerHTML = `
      <div class="hormuz-stats-row">
        <span class="hormuz-stat-chip ${congestionClass}">${congestionLabel}</span>
        <span class="hormuz-stat-total">
          ${stats.total} vessels
          <span class="hormuz-trend" style="color:${trendColor}">${trendIcon}</span>
        </span>
      </div>
      <div class="hormuz-stats-breakdown">
        ${this.renderChip('tanker', stats.tankers)}
        ${this.renderChip('cargo', stats.cargo)}
        ${this.renderChip('passenger', stats.passenger)}
        ${this.renderChip('military', stats.military)}
      </div>
      <div class="hormuz-stats-time">
        Updated ${new Date(stats.lastUpdate).toLocaleTimeString()}
      </div>
    `;
  }

  private renderChip(type: string, count: number): string {
    const color = VESSEL_COLORS[type];
    const label = t(`panels.hormuzVesselTypes.${type}`) || type;
    return `<span class="hormuz-type-chip">
      <span class="hormuz-type-dot" style="background:${color}"></span>
      ${label} <strong>${count}</strong>
    </span>`;
  }

  private drawVesselList(vessels: HormuzVessel[]): void {
    if (!this.vesselListContainer) return;

    if (vessels.length === 0) {
      this.vesselListContainer.innerHTML = '';
      return;
    }

    const items = vessels
      .sort((a, b) => (b.speed ?? 0) - (a.speed ?? 0))
      .slice(0, MAX_LIST_ITEMS);

    const rows = items.map((v) => {
      const color = VESSEL_COLORS[v.category] ?? VESSEL_COLORS.other;
      const name = v.name || v.mmsi;
      const speed = v.speed != null ? `${v.speed.toFixed(1)} kn` : '--';
      const heading = v.heading != null && v.heading !== 511 ? `${Math.round(v.heading)}°` : '--';
      return `<div class="hormuz-vessel-row">
        <span class="hormuz-vessel-dot" style="background:${color}"></span>
        <span class="hormuz-vessel-name">${this.escHtml(name)}</span>
        <span class="hormuz-vessel-speed">${speed}</span>
        <span class="hormuz-vessel-heading">${heading}</span>
      </div>`;
    }).join('');

    const remaining = vessels.length - MAX_LIST_ITEMS;
    const footer = remaining > 0
      ? `<div class="hormuz-velist-footer">+${remaining} more</div>`
      : '';

    this.vesselListContainer.innerHTML = `
      <div class="hormuz-velist-header">
        <span class="hormuz-velist-col">${t('panels.hormuzColName') || 'Vessel'}</span>
        <span class="hormuz-velist-col">${t('panels.hormuzColSpeed') || 'Speed'}</span>
        <span class="hormuz-velist-col">${t('panels.hormuzColHeading') || 'Hdg'}</span>
      </div>
      ${rows}
      ${footer}
    `;
  }

  private escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  public setMapContainer(_mapContainer: MapContainer): void {
    // Kept for API compatibility
  }

  public override destroy(): void {
    super.destroy();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    disconnectHormuzTracking();
  }
}
