/**
 * Strait of Hormuz Traffic Panel
 * Shows a canvas mini-map with vessel positions and traffic statistics.
 */
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

// Bounding box for projection
const BOUNDS = { north: 27.5, south: 25.0, west: 55.5, east: 57.5 };

// Simplified coastline polygons (lat, lon pairs) for the Strait of Hormuz region.
// Iran south coast, Musandam peninsula (Oman), UAE north coast, Qeshm/Hengam islands.
const COASTLINES: [number, number][][] = [
  // Iran south coast (west to east)
  [
    [27.0, 55.5], [26.9, 55.6], [26.8, 55.7], [26.7, 55.8],
    [26.65, 55.9], [26.6, 56.0], [26.55, 56.1], [26.5, 56.15],
    [26.45, 56.2], [26.4, 56.25], [26.35, 56.3], [26.3, 56.35],
    [26.25, 56.4], [26.2, 56.5], [26.15, 56.6], [26.1, 56.7],
    [26.05, 56.8], [26.0, 56.9], [25.95, 57.0], [25.9, 57.1],
    [25.85, 57.2], [25.8, 57.3], [25.75, 57.4], [25.7, 57.5],
    // Extend north to fill the "land" above the coast
    [27.5, 57.5], [27.5, 55.5], [27.0, 55.5],
  ],
  // Musandam Peninsula (Oman) — south side of the strait, eastern part
  [
    [26.4, 56.2], [26.35, 56.25], [26.3, 56.2], [26.25, 56.15],
    [26.2, 56.1], [26.15, 56.0], [26.1, 55.9], [26.0, 55.8],
    [25.9, 55.7], [25.8, 55.6], [25.7, 55.5],
    // Extend south to fill "land"
    [25.0, 55.5], [25.0, 56.4], [26.4, 56.4], [26.4, 56.2],
  ],
  // UAE northern coast (west of Musandam)
  [
    [25.7, 55.5], [25.65, 55.6], [25.55, 55.7], [25.45, 55.8],
    [25.35, 55.9], [25.25, 56.0], [25.15, 56.1], [25.05, 56.2],
    [25.0, 56.3], [25.0, 56.4],
    [25.0, 55.5], [25.7, 55.5],
  ],
  // Qeshm Island
  [
    [26.75, 55.7], [26.7, 55.75], [26.65, 55.8], [26.6, 55.85],
    [26.58, 55.9], [26.6, 55.95], [26.65, 56.0], [26.7, 56.05],
    [26.75, 56.0], [26.78, 55.9], [26.75, 55.8], [26.75, 55.7],
  ],
  // Hengam Island (small, near Qeshm)
  [
    [26.55, 55.88], [26.53, 55.9], [26.52, 55.93], [26.54, 55.95],
    [26.56, 55.93], [26.55, 55.88],
  ],
];

// Vessel type colors
const VESSEL_COLORS: Record<string, string> = {
  tanker: '#ff6b35',    // Orange — oil/LNG carriers
  cargo: '#4ecdc4',     // Teal — container/bulk
  passenger: '#45b7d1', // Blue — cruise/ferry
  military: '#c084fc',  // Purple — warships
  other: '#94a3b8',     // Gray — other
};

const VESSEL_GLOW_COLORS: Record<string, string> = {
  tanker: 'rgba(255,107,53,0.4)',
  cargo: 'rgba(78,205,196,0.4)',
  passenger: 'rgba(69,183,209,0.4)',
  military: 'rgba(192,132,252,0.4)',
  other: 'rgba(148,163,184,0.3)',
};

export class HormuzTrafficPanel extends Panel {
  private canvas: HTMLCanvasElement | null = null;
  private statsContainer: HTMLElement | null = null;
  private mapContainer: MapContainer | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private dpr = 1;

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

    this.mapContainer = mapContainer ?? null;
    this.init();
  }

  private init(): void {
    if (!isAisConfigured()) {
      this.showConfigError(
        'AIS data source not configured. Set AISSTREAM_API_KEY to enable vessel tracking.'
      );
      return;
    }

    this.buildUI();
    initHormuzTracking();
    this.refresh();
    // Refresh every 10 seconds matching AIS polling interval
    this.refreshTimer = setInterval(() => this.refresh(), 10_000);
  }

  private buildUI(): void {
    // Canvas container
    const mapWrap = document.createElement('div');
    mapWrap.className = 'hormuz-traffic-map';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hormuz-traffic-canvas';
    this.canvas.style.cursor = 'pointer';
    this.canvas.addEventListener('click', () => this.flyToHormuz());
    mapWrap.appendChild(this.canvas);

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

    // Handle resize
    this.resizeObserver = new ResizeObserver(() => this.drawMap());
    this.resizeObserver.observe(mapWrap);
  }

  private refresh(): void {
    const stats = getHormuzStats();
    const vessels = getHormuzVessels();
    this.setCount(stats.total);
    this.drawMap(vessels);
    this.drawStats(stats);
  }

  /**
   * Project lat/lon to canvas pixel coordinates.
   */
  private project(lat: number, lon: number, w: number, h: number): [number, number] {
    const x = ((lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * w;
    const y = ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * h;
    return [x, y];
  }

  private drawMap(vessels?: HormuzVessel[]): void {
    if (!this.canvas) return;
    const container = this.canvas.parentElement;
    if (!container) return;

    this.dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = 220;

    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(this.dpr, this.dpr);

    // Background — dark ocean
    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(100,150,200,0.12)';
    ctx.lineWidth = 0.5;
    for (let lat = 25; lat <= 28; lat += 0.5) {
      const [, y] = this.project(lat, BOUNDS.west, w, h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let lon = 55.5; lon <= 58; lon += 0.5) {
      const [x] = this.project(BOUNDS.south, lon, w, h);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Draw coastlines
    ctx.fillStyle = '#1a2744';
    ctx.strokeStyle = 'rgba(100,150,200,0.35)';
    ctx.lineWidth = 1;
    for (const poly of COASTLINES) {
      if (poly.length === 0) continue;
      ctx.beginPath();
      const first = poly[0]!;
      const [x0, y0] = this.project(first[0], first[1], w, h);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < poly.length; i++) {
        const pt = poly[i]!;
        const [px, py] = this.project(pt[0], pt[1], w, h);
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Draw "Strait of Hormuz" label
    const [labelX, labelY] = this.project(26.3, 56.2, w, h);
    ctx.fillStyle = 'rgba(200,220,255,0.25)';
    ctx.font = `${Math.max(9, w * 0.028)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('STRait OF HORMUZ', labelX, labelY);

    // Draw vessels
    const vesselList = vessels ?? getHormuzVessels();
    for (const v of vesselList) {
      const [x, y] = this.project(v.lat, v.lon, w, h);
      const color = VESSEL_COLORS[v.category] ?? VESSEL_COLORS.other;
      const glow = VESSEL_GLOW_COLORS[v.category] ?? VESSEL_GLOW_COLORS.other;

      // Glow
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = glow!;
      ctx.fill();

      // Dot
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color!;
      ctx.fill();

      // Direction indicator (small line showing heading)
      if (v.heading && v.heading !== 511 && v.speed && v.speed > 0.5) {
        const headingRad = ((v.heading - 90) * Math.PI) / 180;
        const len = 6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(headingRad) * len, y + Math.sin(headingRad) * len);
        ctx.strokeStyle = color!;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Water labels
    ctx.fillStyle = 'rgba(100,180,255,0.2)';
    ctx.font = `${Math.max(8, w * 0.022)}px sans-serif`;
    const [pgX, pgY] = this.project(26.8, 55.8, w, h);
    ctx.fillText('Persian Gulf', pgX, pgY);
    const [goX, goY] = this.project(25.6, 57.0, w, h);
    ctx.fillText('Gulf of Oman', goX, goY);
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
    if (!this.mapContainer) return;
    const center = getHormuzCenter();
    this.mapContainer.setCenter(center.lat, center.lon, 8);
  }

  /**
   * Set the map container reference (can be called after construction).
   */
  public setMapContainer(mapContainer: MapContainer): void {
    this.mapContainer = mapContainer;
  }

  public override destroy(): void {
    super.destroy();
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    disconnectHormuzTracking();
  }
}
