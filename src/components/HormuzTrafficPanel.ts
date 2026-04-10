/**
 * Strait of Hormuz Traffic Panel
 * Uses an embedded MapLibre GL map with CARTO dark tiles for accurate geography.
 * Vessels are rendered as circle markers with type-based colors.
 */
import maplibregl from 'maplibre-gl';
import { Panel } from './Panel';
import { t } from '@/services/i18n';
import {
  initHormuzTracking,
  getHormuzVessels,
  getHormuzStats,
  getHormuzCenter,
  disconnectHormuzTracking,
  type HormuzVessel,
  type HormuzTrafficStats,
} from '@/services/hormuz-traffic';
import { isAisConfigured } from '@/services/ais';
import type { MapContainer } from './MapContainer';

// Map center and zoom for the Strait of Hormuz
const MAP_CENTER: [number, number] = [56.5, 26.5]; // [lon, lat]
const MAP_ZOOM = 7.5;

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

export class HormuzTrafficPanel extends Panel {
  private mapContainer: HTMLElement | null = null;
  private map: maplibregl.Map | null = null;
  private statsContainer: HTMLElement | null = null;
  private mainMapContainer: MapContainer | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private mapReady = false;
  private hormuzMapId: string;

  constructor(mapContainer?: MapContainer) {
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
        Data from AISStream.io. Click map to fly to region.`,
    });

    this.mainMapContainer = mapContainer ?? null;
    this.hormuzMapId = `hormuz-map-${Date.now()}`;

    // Default to 2x2 size
    this.getElement().classList.add('col-span-2', 'span-2', 'resized');

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
    this.mapContainer.addEventListener('click', () => this.flyToHormuz());
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

    this.content.innerHTML = '';
    this.content.appendChild(mapWrap);
    this.content.appendChild(this.statsContainer);

    // Initialize MapLibre map
    requestAnimationFrame(() => this.initMap());
  }

  private initMap(): void {
    if (!this.mapContainer) return;

    try {
      this.map = new maplibregl.Map({
        container: this.mapContainer,
        style: DARK_STYLE,
        center: MAP_CENTER,
        zoom: MAP_ZOOM,
        attributionControl: false,
        interactive: false, // Read-only mini-map; click flies the main map
        trackResize: true,
        maxBounds: [
          [54.5, 24.0], // SW
          [58.5, 28.5], // NE
        ],
      });

      this.map.on('load', () => {
        this.mapReady = true;
        this.addVesselLayers();
        this.refresh();
      });
    } catch {
      // Fallback: show a simple message if WebGL not available
      if (this.mapContainer) {
        this.mapContainer.innerHTML = '<div class="hormuz-map-fallback">Map unavailable</div>';
      }
    }
  }

  private addVesselLayers(): void {
    if (!this.map || !this.mapReady) return;

    // Add empty GeoJSON source for vessels
    this.map.addSource(VESSEL_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    // Glow layer (larger, transparent circles behind the dots)
    this.map.addLayer({
      id: VESSEL_GLOW_LAYER_ID,
      type: 'circle',
      source: VESSEL_SOURCE_ID,
      paint: {
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          6, 6,
          10, 14,
        ] as any,
        'circle-color': [
          'match', ['get', 'category'],
          'tanker', 'rgba(255,107,53,0.35)',
          'cargo', 'rgba(78,205,196,0.35)',
          'passenger', 'rgba(69,183,209,0.35)',
          'military', 'rgba(192,132,252,0.35)',
          'rgba(148,163,184,0.25)',
        ] as any,
        'circle-blur': 0.6,
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
          10, 6,
        ] as any,
        'circle-color': [
          'match', ['get', 'category'],
          'tanker', VESSEL_COLORS.tanker!,
          'cargo', VESSEL_COLORS.cargo!,
          'passenger', VESSEL_COLORS.passenger!,
          'military', VESSEL_COLORS.military!,
          VESSEL_COLORS.other!,
        ] as any,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
      },
    });
  }

  private refresh(): void {
    const stats = getHormuzStats();
    const vessels = getHormuzVessels();
    this.setCount(stats.total);
    this.updateVessels(vessels);
    this.drawStats(stats);
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

  private flyToHormuz(): void {
    if (!this.mainMapContainer) return;
    const center = getHormuzCenter();
    this.mainMapContainer.setCenter(center.lat, center.lon, 8);
  }

  public setMapContainer(mapContainer: MapContainer): void {
    this.mainMapContainer = mapContainer;
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
