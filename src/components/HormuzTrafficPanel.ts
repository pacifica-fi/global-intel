/**
 * Strait of Hormuz Traffic Panel
 * MapLibre GL basemap + canvas overlay for vessel dots with hover tooltips.
 */
import maplibregl from 'maplibre-gl';
import { Panel } from './Panel';
import { t } from '@/services/i18n';
import {
  initHormuzTracking,
  getHormuzStats,
  disconnectHormuzTracking,
  type HormuzTrafficStats,
} from '@/services/hormuz-traffic';
import {
  registerHormuzCallback,
  unregisterHormuzCallback,
  type AisPositionData,
} from '@/services/ais';
import { isAisConfigured } from '@/services/ais';
import type { MapContainer } from './MapContainer';

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const COLORS: Record<string, string> = {
  tanker: '#ff6b35',
  cargo: '#4ecdc4',
  passenger: '#45b7d1',
  military: '#c084fc',
  other: '#fbbf24',
};

// Simplified vessel classification by name patterns + AIS ship type codes
function guessCategory(v: AisPositionData): string {
  const name = (v.name || '').toUpperCase();
  const st = v.shipType;
  if (st != null) {
    if (st === 35 || st === 55) return 'military';
    if (st >= 80 && st <= 89) return 'tanker';
    if (st >= 70 && st <= 79) return 'cargo';
    if (st >= 60 && st <= 69) return 'passenger';
  }
  // Name-based classification (common in Persian Gulf where shipType is often missing)
  if (/TANKER|CRUDE|LNG|LPG|GAS CARR|OIL|PRODUCT|NATURAL|BITUMEN|NAPHTHA|CONDENSATE|FUEL|PETRO|MT\s|MT\.|M\.T\.|SUNNY|DIANA|NITC|NIOC|VLCC|SUEZMAX|AFRAMAX|PANAMAX/i.test(name)) return 'tanker';
  if (/CONTAINER|BULK|CARGO|CARRIER|FEEDER|M.V\.|MV\s|GENERAL CARGO|MULTIPURPOSE|HEAVY LIFT|REEFER|CEMENT|TIMBER|LOG/i.test(name)) return 'cargo';
  if (/CRUISE|FERRY|PASSENGER|YACHT|SPEEDBOAT|DHOW/i.test(name)) return 'passenger';
  if (/USS|USNS|HMS|INS|JS |PLAN|ROKS|TCG|CGC|PATROL|GUARD|NAVY|MILITARY|WARSHIP|FRIGATE|DESTROYER|CORVETTE|MINE|SUBMARINE|IRIS|IRIN|IRGN/i.test(name)) return 'military';
  // Persian Gulf specific: many vessels with numeric/call-sign names are tankers or cargo
  if (/^[A-Z]{2,4}\d{4,}$/.test(name) || /^V7C|^V7F|^4HM|^4HA|^4HB/i.test(name)) return 'other';
  return 'other';
}

interface VesselPoint {
  x: number;
  y: number;
  data: AisPositionData;
  category: string;
}

export class HormuzTrafficPanel extends Panel {
  private mapWrap: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private tooltipEl: HTMLElement | null = null;
  private map: maplibregl.Map | null = null;
  private statsEl: HTMLElement | null = null;
  private noDataEl: HTMLElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private mapLoaded = false;
  private didFit = false;
  private vessels: AisPositionData[] = [];
  private points: VesselPoint[] = [];
  private lastDataTime = 0;

  constructor(_mc?: MapContainer) {
    super({
      id: 'hormuz-traffic',
      title: t('panels.hormuzTraffic') || 'Strait of Hormuz Traffic',
      showCount: true,
      trackActivity: true,
      infoTooltip: `<strong>Strait of Hormuz Traffic</strong>
        Real-time vessel positions via AIS.
        <ul><li>Orange = Tankers</li><li>Teal = Cargo</li><li>Blue = Passenger</li>
        <li>Purple = Military</li><li>Yellow = Other</li></ul>
        <br><em>Data source: AISStream.io (terrestrial + satellite AIS). Coverage in the Persian Gulf may vary.</em>`,
    });
    this.getElement().classList.add('col-span-2', 'span-3', 'resized');
    this.init();
  }

  private init(): void {
    this.buildUI();
    if (isAisConfigured()) initHormuzTracking();
    registerHormuzCallback(this.onHormuzData);
    this.timer = setInterval(() => this.drawStats(getHormuzStats()), 10_000);
    setTimeout(() => this.drawStats(getHormuzStats()), 2000);
  }

  private onHormuzData = (vessels: AisPositionData[]): void => {
    this.vessels = vessels;
    this.lastDataTime = Date.now();
    if (this.noDataEl && vessels.length > 0) {
      this.noDataEl.style.display = 'none';
    }
    if (this.mapLoaded) {
      if (!this.didFit && vessels.length > 0) {
        this.didFit = true;
        this.fitToVessels(vessels);
      }
      this.drawVessels();
    }
  };

  private buildUI(): void {
    this.mapWrap = document.createElement('div');
    this.mapWrap.className = 'hormuz-traffic-map';

    const mapEl = document.createElement('div');
    mapEl.className = 'hormuz-traffic-maplibre';
    this.mapWrap.appendChild(mapEl);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hormuz-vessel-canvas';
    this.mapWrap.appendChild(this.canvas);

    // Tooltip
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'hormuz-vessel-tooltip';
    this.tooltipEl.style.display = 'none';
    this.mapWrap.appendChild(this.tooltipEl);

    // Legend
    const legend = document.createElement('div');
    legend.className = 'hormuz-traffic-legend';
    legend.innerHTML = Object.entries(COLORS)
      .map(([type, color]) => {
        const label = t(`panels.hormuzVesselTypes.${type}`) || type;
        return `<span class="hormuz-legend-item"><span class="hormuz-legend-dot" style="background:${color}"></span>${label}</span>`;
      }).join('');
    this.mapWrap.appendChild(legend);

    this.statsEl = document.createElement('div');
    this.statsEl.className = 'hormuz-traffic-stats';

    // No-data overlay
    this.noDataEl = document.createElement('div');
    this.noDataEl.className = 'hormuz-no-data';
    this.noDataEl.textContent = t('panels.hormuzNoData') || 'Waiting for vessel data...';
    this.mapWrap.appendChild(this.noDataEl);

    this.content.innerHTML = '';
    this.content.appendChild(this.mapWrap);
    this.content.appendChild(this.statsEl);

    // Canvas mouse events for tooltip
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.hideTooltip());

    requestAnimationFrame(() => this.createMap(mapEl));
  }

  private createMap(mapEl: HTMLElement): void {
    try {
      const m = new maplibregl.Map({
        container: mapEl,
        style: DARK_STYLE,
        center: [56.0, 26.0],
        zoom: 7,
        attributionControl: false,
        interactive: true,
        trackResize: true,
        minZoom: 4,
        maxZoom: 14,
      });
      m.on('load', () => {
        this.map = m;
        this.mapLoaded = true;
        m.on('move', () => this.drawVessels());
        m.on('zoom', () => this.drawVessels());
        // Draw if data already arrived
        if (this.vessels.length > 0) {
          if (!this.didFit) {
            this.didFit = true;
            this.fitToVessels(this.vessels);
          }
          this.drawVessels();
        }
      });
    } catch {
      mapEl.innerHTML = '<div class="hormuz-map-fallback">Map unavailable</div>';
    }
  }

  private fitToVessels(vs: AisPositionData[]): void {
    if (!this.map || vs.length === 0) return;
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const v of vs) {
      if (v.lat < minLat) minLat = v.lat;
      if (v.lat > maxLat) maxLat = v.lat;
      if (v.lon < minLon) minLon = v.lon;
      if (v.lon > maxLon) maxLon = v.lon;
    }
    this.map.fitBounds(
      [[minLon - 0.3, minLat - 0.3], [maxLon + 0.3, maxLat + 0.3]],
      { padding: 30, duration: 500, maxZoom: 11 },
    );
  }

  private drawVessels(): void {
    if (!this.map || !this.canvas || !this.mapWrap) return;
    const w = this.mapWrap.clientWidth;
    const h = this.mapWrap.clientHeight;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const vs = this.vessels;
    if (vs.length === 0) {
      // Show waiting message
      if (this.noDataEl) {
        const noAis = !isAisConfigured();
        this.noDataEl.textContent = noAis
          ? (t('panels.hormuzAisNotConfigured') || 'AIS data not configured')
          : (t('panels.hormuzNoData') || 'Waiting for vessel data...');
        this.noDataEl.style.display = 'block';
      }
      return;
    }

    const zoom = this.map.getZoom();
    const dotR = Math.max(3, Math.min(7, zoom - 2));

    this.points = [];

    for (const v of vs) {
      const pt = this.map!.project({ lat: v.lat, lon: v.lon });
      if (pt.x < -50 || pt.x > w + 50 || pt.y < -50 || pt.y > h + 50) continue;

      const category = guessCategory(v);
      const color = COLORS[category] || COLORS.other!;

      this.points.push({ x: pt.x, y: pt.y, data: v, category });

      // Outer glow
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, dotR + 4, 0, Math.PI * 2);
      ctx.fillStyle = color + '25';
      ctx.fill();

      // Dot
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Bright center
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, dotR * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff80';
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

  private onMouseMove(e: MouseEvent): void {
    const rect = this.canvas!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let closest: VesselPoint | null = null;
    let minDist = 20; // 20px hover radius
    for (const p of this.points) {
      const d = Math.sqrt((p.x - mx) ** 2 + (p.y - my) ** 2);
      if (d < minDist) {
        minDist = d;
        closest = p;
      }
    }

    if (closest) {
      this.showTooltip(closest, mx, my);
    } else {
      this.hideTooltip();
    }
  }

  private showTooltip(vp: VesselPoint, mx: number, my: number): void {
    if (!this.tooltipEl) return;
    const v = vp.data;
    const color = COLORS[vp.category] || COLORS.other!;
    const name = v.name || v.mmsi;
    const speed = v.speed != null ? `${v.speed.toFixed(1)} kn` : '--';
    const heading = v.heading != null && v.heading !== 511 ? `${Math.round(v.heading)}°` : '--';
    const category = t(`panels.hormuzVesselTypes.${vp.category}`) || vp.category;

    this.tooltipEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
        <strong>${this.esc(name)}</strong>
      </div>
      <div class="hormuz-tt-row">Type: ${category}</div>
      <div class="hormuz-tt-row">MMSI: ${v.mmsi}</div>
      <div class="hormuz-tt-row">Speed: ${speed} | Hdg: ${heading}</div>
      <div class="hormuz-tt-row">${v.lat.toFixed(4)}°N, ${v.lon.toFixed(4)}°E</div>
    `;
    this.tooltipEl.style.display = 'block';

    // Position tooltip near cursor
    const wrap = this.mapWrap!;
    const ttW = 180;
    let left = mx + 12;
    let top = my - 10;
    if (left + ttW > wrap.clientWidth) left = mx - ttW - 12;
    if (top < 0) top = my + 12;
    this.tooltipEl.style.left = `${left}px`;
    this.tooltipEl.style.top = `${top}px`;
  }

  private hideTooltip(): void {
    if (this.tooltipEl) this.tooltipEl.style.display = 'none';
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private drawStats(stats: HormuzTrafficStats): void {
    if (!this.statsEl) return;
    this.setCount(stats.total);
    const ti = stats.trend === 'up' ? '▲' : stats.trend === 'down' ? '▼' : '●';
    const tc = stats.trend === 'up' ? '#ff6b35' : stats.trend === 'down' ? '#4ecdc4' : '#94a3b8';
    const cc = `hormuz-congestion-${stats.congestion}`;
    const cl = t(`panels.hormuzCongestion.${stats.congestion}`) || stats.congestion;
    const dataAge = this.lastDataTime ? Date.now() - this.lastDataTime : -1;
    const stale = dataAge > 60000;
    const timeStr = stale && this.lastDataTime
      ? `Last update: ${Math.round(dataAge / 1000)}s ago`
      : `Updated ${new Date(stats.lastUpdate).toLocaleTimeString()}`;

    this.statsEl.innerHTML = `
      <div class="hormuz-stats-row">
        <span class="hormuz-stat-chip ${cc}">${cl}</span>
        <span class="hormuz-stat-total">${stats.total} vessels <span class="hormuz-trend" style="color:${tc}">${ti}</span></span>
      </div>
      <div class="hormuz-stats-breakdown">
        ${this.chip('tanker', stats.tankers)}${this.chip('cargo', stats.cargo)}
        ${this.chip('passenger', stats.passenger)}${this.chip('military', stats.military)}
        ${stats.other > 0 ? this.chip('other', stats.other) : ''}
      </div>
      <div class="hormuz-stats-time" ${stale ? 'style="color:var(--semantic-elevated)"' : ''}>${timeStr} · AISStream.io</div>`;
  }

  private chip(type: string, count: number): string {
    const c = COLORS[type];
    const l = t(`panels.hormuzVesselTypes.${type}`) || type;
    return `<span class="hormuz-type-chip"><span class="hormuz-type-dot" style="background:${c}"></span>${l} <strong>${count}</strong></span>`;
  }

  public setMapContainer(_mc: MapContainer): void {}

  public override destroy(): void {
    super.destroy();
    if (this.timer) clearInterval(this.timer);
    unregisterHormuzCallback(this.onHormuzData);
    if (this.map) { this.map.remove(); this.map = null; }
    disconnectHormuzTracking();
  }
}
