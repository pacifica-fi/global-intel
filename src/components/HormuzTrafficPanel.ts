/**
 * Strait of Hormuz Traffic Panel
 * 2x2 grid dashboard showing data from hormuzstraitmonitor.com/api/dashboard.
 */
import { Panel } from './Panel';
import type { MapContainer } from './MapContainer';
import { t } from '@/services/i18n';
import {
  initHormuzStatusTracking,
  registerHormuzStatusCallback,
  unregisterHormuzStatusCallback,
  type HormuzStatusData,
  type HormuzDashboardData,
  type HormuzAlternativeRoute,
  type HormuzTimelineEvent,
  type HormuzNewsItem,
  type HormuzAffectedRegion,
} from '@/services/hormuz-traffic';

const STATUS_COLORS: Record<string, string> = {
  RESTRICTED: '#ff6b35',
  CLOSED: '#ef4444',
  OPEN: '#4ecdc4',
  UNKNOWN: '#94a3b8',
};

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#ff6b35',
  MODERATE: '#fbbf24',
  LOW: '#4ecdc4',
};

const EVENT_COLORS: Record<string, string> = {
  MILITARY: '#ef4444',
  ESCALATION: '#ff6b35',
  DIPLOMATIC: '#4ecdc4',
  POLITICAL: '#45b7d1',
  ECONOMIC: '#fbbf24',
  NAVAL: '#c084fc',
};

function sevColor(sev: string): string {
  return SEVERITY_COLORS[sev.toUpperCase()] ?? '#94a3b8';
}

function stColor(status: string): string {
  return STATUS_COLORS[status.toUpperCase()] ?? STATUS_COLORS.UNKNOWN!;
}

function evtColor(type: string): string {
  return EVENT_COLORS[type.toUpperCase()] ?? '#94a3b8';
}

export class HormuzTrafficPanel extends Panel {
  private contentEl: HTMLElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastData: HormuzStatusData | null = null;

  constructor(_mc?: MapContainer) {
    super({
      id: 'hormuz-traffic',
      title: t('panels.hormuzTraffic') || 'Strait of Hormuz Traffic',
      showCount: true,
      trackActivity: true,
      infoTooltip: `<strong>Strait of Hormuz Monitor</strong>
        Live data from hormuzstraitmonitor.com/api/dashboard.
        <ul><li>Strait status, traffic &amp; oil price</li><li>Insurance, trade impact &amp; supply chain</li>
        <li>Diplomacy &amp; crisis timeline</li><li>Alternative routes &amp; latest news</li></ul>
        <br><em>Updated every 5 minutes.</em>`,
    });
    this.getElement().classList.add('col-span-2', 'span-2', 'resized');
    this.init();
  }

  private init(): void {
    this.content.innerHTML = ''; // Clear base-class loading animation
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'hormuz-grid';
    this.content.appendChild(this.contentEl);

    initHormuzStatusTracking();
    registerHormuzStatusCallback(this.onData);
    this.timer = setInterval(() => {
      if (this.lastData) this.render(this.lastData);
    }, 60_000);
  }

  private onData = (data: HormuzStatusData): void => {
    this.lastData = data;
    this.setCount(data.data?.shipCount?.currentTransits ?? 0);
    this.render(data);
  };

  private render(wrapper: HormuzStatusData): void {
    if (!this.contentEl) return;
    const d = wrapper.data;
    if (!d) {
      this.contentEl.innerHTML = `<div class="hormuz-loading">${wrapper.error ?? 'No data'}</div>`;
      return;
    }
    const safe = (fn: () => string) => { try { return fn(); } catch { return '<div class="hq-dim">Error</div>'; } };
    this.contentEl.innerHTML = `
      <div class="hormuz-quadrant">
        ${safe(() => this.qStatusTraffic(d))}
      </div>
      <div class="hormuz-quadrant">
        ${safe(() => this.qInsuranceImpact(d))}
      </div>
      <div class="hormuz-quadrant">
        ${safe(() => this.qDiplomacyTimeline(d))}
      </div>
      <div class="hormuz-quadrant">
        ${safe(() => this.qRoutesNews(d, wrapper.fetchedAt))}
      </div>
    `;
  }

  // ---- Quadrant 1: Strait Status + Traffic + Oil Price ----
  private qStatusTraffic(d: HormuzDashboardData): string {
    const s = d.straitStatus ?? { status: 'UNKNOWN', since: '', description: '' };
    const sc = d.shipCount ?? { currentTransits: 0, last24h: 0, normalDaily: 0, percentOfNormal: 0 };
    const op = d.oilPrice ?? { brentPrice: 0, change24h: 0, changePercent24h: 0, sparkline: [] };
    const th = d.throughput ?? { todayDWT: 0, averageDWT: 0, percentOfNormal: 0, last7Days: [] };
    const color = stColor(s.status);
    const pctColor = (sc.percentOfNormal > 70) ? '#4ecdc4' : (sc.percentOfNormal > 30) ? '#fbbf24' : '#ff6b35';
    const priceUp = op.change24h >= 0;

    // Mini sparkline SVG
    const sparkline = this.sparklineSvg(op.sparkline, 120, 28);

    return `
      <div class="hq-title">Strait Status &amp; Traffic</div>
      <div class="hq-status-row" style="border-left:3px solid ${color}">
        <span class="hq-status-badge" style="color:${color}">${this.esc(s.status)}</span>
        <span class="hq-status-since">Since ${this.esc(s.since)}</span>
      </div>
      <div class="hq-metrics">
        <div class="hq-metric">
          <span class="hq-mv">${sc.currentTransits}</span>
          <span class="hq-ml">Transiting</span>
        </div>
        <div class="hq-metric">
          <span class="hq-mv">${sc.last24h}</span>
          <span class="hq-ml">Last 24h</span>
        </div>
        <div class="hq-metric">
          <span class="hq-mv">${sc.normalDaily}</span>
          <span class="hq-ml">Normal</span>
        </div>
        <div class="hq-metric">
          <span class="hq-mv" style="color:${pctColor}">${sc.percentOfNormal}%</span>
          <span class="hq-ml">Throughput</span>
        </div>
      </div>
      <div class="hq-bar"><div class="hq-bar-fill" style="width:${Math.min(sc.percentOfNormal, 100)}%;background:${pctColor}"></div></div>
      <div class="hq-subsection">
        <div class="hq-oil-row">
          <span class="hq-oil-label">Brent Crude</span>
          <span class="hq-oil-price">$${op.brentPrice.toFixed(2)}</span>
          <span class="hq-oil-change" style="color:${priceUp ? '#ef4444' : '#4ecdc4'}">${priceUp ? '+' : ''}${op.changePercent24h.toFixed(2)}%</span>
        </div>
        ${sparkline}
      </div>
      <div class="hq-subsection">
        <span class="hq-dim">DWT Today: ${this.fmtNum(th.todayDWT)} / ${this.fmtNum(th.averageDWT)} (${th.percentOfNormal}%)</span>
      </div>
      <div class="hq-subsection">
        <span class="hq-dim">${this.esc(s.description.substring(0, 160))}</span>
      </div>
    `;
  }

  // ---- Quadrant 2: Insurance + Trade Impact + Supply Chain ----
  private qInsuranceImpact(d: HormuzDashboardData): string {
    const ins = d.insurance ?? { level: 'UNKNOWN', warRiskPercent: 0, normalPercent: 0, multiplier: 0 };
    const gti = d.globalTradeImpact ?? { percentOfWorldOilAtRisk: 0, estimatedDailyCostBillions: 0, affectedRegions: [], lngImpact: { percentOfWorldLngAtRisk: 0, estimatedLngDailyCostBillions: 0, topAffectedImporters: [], description: '' }, alternativeRoutes: [], supplyChainImpact: { shippingRateIncreasePercent: 0, consumerPriceImpactPercent: 0, sprStatusDays: 0, keyDisruptions: [] } };
    const sci = gti.supplyChainImpact ?? { shippingRateIncreasePercent: 0, consumerPriceImpactPercent: 0, sprStatusDays: 0, keyDisruptions: [] };
    const lng = gti.lngImpact ?? { percentOfWorldLngAtRisk: 0, estimatedLngDailyCostBillions: 0, topAffectedImporters: [], description: '' };
    const insColor = (ins.level.toUpperCase() === 'EXTREME') ? '#ef4444' : (ins.level.toUpperCase() === 'HIGH') ? '#ff6b35' : '#fbbf24';
    const sv = d.strandedVessels ?? { total: 0, tankers: 0, bulk: 0, other: 0, changeToday: 0 };

    return `
      <div class="hq-title">Insurance &amp; Trade Impact</div>
      <div class="hq-cards">
        <div class="hq-card">
          <div class="hq-card-label">War Risk</div>
          <div class="hq-card-val" style="color:${insColor}">${this.esc(ins.level)}</div>
          <div class="hq-card-sub">${ins.warRiskPercent}% (${ins.multiplier}x normal)</div>
        </div>
        <div class="hq-card">
          <div class="hq-card-label">World Oil at Risk</div>
          <div class="hq-card-val">${gti.percentOfWorldOilAtRisk}%</div>
          <div class="hq-card-sub">$${gti.estimatedDailyCostBillions}B daily cost</div>
        </div>
        <div class="hq-card">
          <div class="hq-card-label">LNG at Risk</div>
          <div class="hq-card-val">${lng.percentOfWorldLngAtRisk}%</div>
          <div class="hq-card-sub">${lng.topAffectedImporters.join(', ')}</div>
        </div>
        <div class="hq-card">
          <div class="hq-card-label">Shipping Rates</div>
          <div class="hq-card-val">+${sci.shippingRateIncreasePercent}%</div>
          <div class="hq-card-sub">Consumer prices +${sci.consumerPriceImpactPercent}%</div>
        </div>
        <div class="hq-card">
          <div class="hq-card-label">SPR Reserve</div>
          <div class="hq-card-val">${sci.sprStatusDays}d</div>
          <div class="hq-card-sub">Strategic Petroleum</div>
        </div>
        <div class="hq-card">
          <div class="hq-card-label">Stranded</div>
          <div class="hq-card-val">${sv.total}</div>
          <div class="hq-card-sub">${sv.tankers} tankers / ${sv.bulk} bulk</div>
        </div>
      </div>
      <div class="hq-section-sep"></div>
      <div class="hq-subsection">
        <div class="hq-mini-title">Affected Regions</div>
        ${gti.affectedRegions.map((r: HormuzAffectedRegion) => `
          <div class="hq-region-row">
            <span class="hq-region-sev" style="color:${sevColor(r.severity)}">${this.esc(r.severity)}</span>
            <span class="hq-region-name">${this.esc(r.name)}</span>
            <span class="hq-region-pct">${r.oilDependencyPercent}%</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ---- Quadrant 3: Diplomacy + Crisis Timeline ----
  private qDiplomacyTimeline(d: HormuzDashboardData): string {
    const dip = d.diplomacy ?? { status: '', headline: '', date: '', parties: [], summary: '' };
    const events = d.crisisTimeline?.events ?? [];
    const dipColor = (dip.status === 'IN PROGRESS' || dip.status === 'TALKS_IN_PROGRESS') ? '#4ecdc4' : '#fbbf24';

    return `
      <div class="hq-title">Diplomacy &amp; Timeline</div>
      <div class="hq-dip-box">
        <div class="hq-dip-status" style="color:${dipColor}">${this.esc(dip.status)}</div>
        <div class="hq-dip-headline">${this.esc(dip.headline)}</div>
        <div class="hq-dip-meta">${this.esc(dip.date)} &middot; ${dip.parties.join(', ')}</div>
        <div class="hq-dip-summary">${this.esc(dip.summary.substring(0, 200))}</div>
      </div>
      <div class="hq-section-sep"></div>
      <div class="hq-subsection">
        <div class="hq-mini-title">Crisis Timeline</div>
        <div class="hq-timeline">
          ${events.slice(0, 10).map((e: HormuzTimelineEvent) => {
            const ec = evtColor(e.type);
            return `
              <div class="hq-tl-item">
                <span class="hq-tl-dot" style="background:${ec}"></span>
                <span class="hq-tl-date">${this.esc(e.date)}</span>
                <span class="hq-tl-type" style="color:${ec}">${this.esc(e.type)}</span>
                <span class="hq-tl-text">${this.esc(e.title)}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // ---- Quadrant 4: Alternative Routes + News ----
  private qRoutesNews(d: HormuzDashboardData, fetchedAt: string): string {
    const routes = d.globalTradeImpact?.alternativeRoutes ?? [];
    const news = d.news ?? [];

    return `
      <div class="hq-title">Routes &amp; News</div>
      <div class="hq-routes">
        ${routes.map((r: HormuzAlternativeRoute) => `
          <div class="hq-route">
            <div class="hq-route-name">${this.esc(r.name)}</div>
            <div class="hq-route-meta">
              ${r.additionalDays ? `<span class="hq-route-tag">+${r.additionalDays}d</span>` : ''}
              <span class="hq-route-tag">+$${r.additionalCostPerVessel}M</span>
            </div>
            <div class="hq-route-status">${this.esc(r.currentUsageStatus.substring(0, 80))}</div>
          </div>
        `).join('')}
      </div>
      <div class="hq-section-sep"></div>
      <div class="hq-subsection">
        <div class="hq-mini-title">Latest News</div>
        <div class="hq-news">
          ${news.slice(0, 6).map((n: HormuzNewsItem) => `
            <a class="hq-news-item" href="${this.esc(n.url)}" target="_blank" rel="noopener noreferrer">
              <span class="hq-news-time ${this.newsStaleness(n.publishedAt)}">${this.relativeTime(n.publishedAt)}</span>
              <span class="hq-news-source">${this.esc(n.source)}</span>
              ${this.esc(n.title)}
            </a>
          `).join('')}
        </div>
      </div>
      <div class="hq-footer">
        <span>hormuzstraitmonitor.com</span>
        <span>${fetchedAt ? new Date(fetchedAt).toLocaleTimeString() : ''}</span>
      </div>
    `;
  }

  // ---- Helpers ----

  private sparklineSvg(data: number[], w: number, h: number): string {
    if (!data || data.length < 2) return '';
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = w / (data.length - 1);
    const points = data.map((v, i) => `${(i * stepX).toFixed(1)},${(h - ((v - min) / range) * (h - 4) - 2).toFixed(1)}`).join(' ');
    return `<svg class="hq-sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  private fmtNum(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
    return String(n);
  }

  private esc(s: unknown): string {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private relativeTime(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr.replace(' ', 'T'));
    const diffMs = Date.now() - d.getTime();
    if (isNaN(diffMs)) return '';
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }

  private newsStaleness(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr.replace(' ', 'T'));
    const hrs = (Date.now() - d.getTime()) / 3_600_000;
    if (isNaN(hrs)) return '';
    if (hrs > 24) return 'stale';
    if (hrs > 6) return 'aging';
    return '';
  }

  public override destroy(): void {
    super.destroy();
    if (this.timer) clearInterval(this.timer);
    unregisterHormuzStatusCallback(this.onData);
  }
}
