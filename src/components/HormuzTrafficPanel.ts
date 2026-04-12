/**
 * Strait of Hormuz Traffic Panel
 * MapLibre GL basemap + canvas overlay for vessel markers.
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

const VESSEL_COLORS: Record<string, string> = {
  tanker: '#ff6b35',
  cargo: '#4ecdc4',
  passenger: '#45b7d1',
  military: '#c084fc',
  other: '#94a3b8',
};

export class HormuzTrafficPanel extends Panel {
  private mapWrap: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private map: maplibregl.Map | null = null;
  private statsEl: HTMLElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private mapLoaded = false;
  private didFit = false;
  private currentVessels: HormuzVessel[] = [];
  private dpr = 1;

  constructor(_mapContainer?: MapContainer) {
    super({
      id: 'hormuz-traffic',
      title: t('panels.hormuzTraffic') || 'Strait of Hormuz Traffic',
      showCount: true,
      trackActivity: true,
      infoTooltip: `<strong>Strait of Hormuz Traffic</strong>
        Real-time vessel positions via AIS.
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
    this.mapWrap = document.createElement('div');
    this.mapWrap.className = 'hormuz-traffic-map';

    // MapLibre container
    const mapEl = document.createElement('div');
    mapEl.className = 'hormuz-traffic-maplibre';
    this.mapWrap.appendChild(mapEl);

    // Canvas overlay for vessel dots (on top of map tiles)
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hormuz-vessel-canvas';
    this.mapWrap.appendChild(this.canvas);

    // Legend
    const legend = document.createElement('div');
    legend.className = 'hormuz-traffic-legend';
    legend.innerHTML = Object.entries(VESSEL_COLORS)
      .map(([type, color]) => {
        const label = t(`panels.hormuzVesselTypes.${type}`) || type;
        return `<span class="hormuz-legend-item"><span class="hormuz-legend-dot" style="background:${color}"></span>${label}</span>`;
      }).join('');
    this.mapWrap.appendChild(legend);

    this.statsEl = document.createElement('div');
    this.statsEl.className = 'hormuz-traffic-stats';

    this.content.innerHTML = '';
    this.content.appendChild(this.mapWrap);
    this.content.appendChild(this.statsEl);

    requestAnimationFrame(() => this.createMap(mapEl));
  }

  private createMap(mapEl: HTMLElement): void {
    try {
      const m = new maplibregl.Map({
        container: mapEl,
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
        this.map = m;
        this.mapLoaded = true;
        // Redraw vessels on every map move/zoom
        m.on('move', () => this.drawVessels());
        m.on('zoom', () => this.drawVessels());
        this.refresh();
      });
    } catch {
      mapEl.innerHTML = '<div class="hormuz-map-fallback">Map unavailable</div>';
    }
  }

  private refresh(): void {
    const stats = getHormuzStats();
    const vessels = getHormuzVessels();
    this.setCount(stats.total);
    this.drawStats(stats);
    this.currentVessels = vessels;

    if (this.mapLoaded && this.map) {
      // Auto-fit on first data
      if (!this.didFit && vessels.length > 0) {
        this.didFit = true;
        this.fitToVessels(vessels);
      }
      this.drawVessels();

      // No-data watermark
      const noData = this.mapWrap?.querySelector('.hormuz-no-data');
      if (vessels.length === 0 && !noData) {
        const el = document.createElement('div');
        el.className = 'hormuz-no-data';
        el.textContent = isAisConfigured()
          ? (t('panels.hormuzNoData') || 'Waiting for vessel data...')
          : (t('panels.hormuzAisNotConfigured') || 'AIS not configured');
        this.mapWrap?.appendChild(el);
      } else if (vessels.length > 0 && noData) {
        noData.remove();
      }
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

  private drawVessels(): void {
    if (!this.map || !this.canvas || !this.mapWrap) return;

    const wrap = this.mapWrap;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w === 0 || h === 0) return;

    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const vessels = this.currentVessels;
    if (vessels.length === 0) return;

    const zoom = this.map.getZoom();
    const dotR = Math.max(3.5, Math.min(7, zoom - 2));
    const glowR = dotR + 5;

    for (const v of vessels) {
      const pt = this.map.project({ lat: v.lat, lon: v.lon });
      if (pt.x < -50 || pt.x > w + 50 || pt.y < -50 || pt.y > h + 50) continue;

      const color = VESSEL_COLORS[v.category] || VESSEL_COLORS.other!;

      // Glow — radial gradient from color to transparent
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, glowR, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(pt.x, pt.y, dotR * 0.5, pt.x, pt.y, glowR);
      grad.addColorStop(0, color + '80'); // 50% alpha via hex
      grad.addColorStop(1, color + '00'); // 0% alpha
      ctx.fillStyle = grad;
      ctx.fill();

      // Solid colored dot
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Heading line
      if (v.heading != null && v.heading !== 511 && v.speed != null && v.speed > 0.5) {
        const rad = ((v.heading - 90) * Math.PI) / 180;
        const len = dotR + 6;
        ctx.beginPath();
        ctx.moveTo(pt.x, pt.y);
        ctx.lineTo(pt.x + Math.cos(rad) * len, pt.y + Math.sin(rad) * len);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
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
