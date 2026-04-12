/**
 * Strait of Hormuz Traffic Panel
 * Dashboard panel showing curated data from hormuzstraitmonitor.com.
 * Replaces the previous MapLibre + canvas approach.
 */
import { Panel } from './Panel';
import { t } from '@/services/i18n';
import {
  initHormuzStatusTracking,
  registerHormuzStatusCallback,
  unregisterHormuzStatusCallback,
  type HormuzStatusData,
  type HormuzStraitStatus,
  type HormuzTrafficData,
  type HormuzWarRisk,
  type HormuzLngImpact,
  type HormuzSupplyChain,
  type HormuzAlternativeRoute,
  type HormuzTimelineEvent,
  type HormuzNewsItem,
  type HormuzPeaceTalks,
} from '@/services/hormuz-traffic';

const STATUS_COLORS: Record<string, string> = {
  RESTRICTED: '#ff6b35',
  CLOSED: '#ef4444',
  OPEN: '#4ecdc4',
  UNKNOWN: '#94a3b8',
};

function statusColor(state: string): string {
  return STATUS_COLORS[state.toUpperCase()] || STATUS_COLORS.UNKNOWN;
}

export class HormuzTrafficPanel extends Panel {
  private contentEl: HTMLElement | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastData: HormuzStatusData | null = null;

  constructor() {
    super({
      id: 'hormuz-traffic',
      title: t('panels.hormuzTraffic') || 'Strait of Hormuz Traffic',
      showCount: true,
      trackActivity: true,
      infoTooltip: `<strong>Strait of Hormuz Monitor</strong>
        Curated data from hormuzstraitmonitor.com.
        <ul><li>Strait status and duration</li><li>Traffic throughput vs normal</li>
        <li>War risk insurance premiums</li><li>LNG impact analysis</li>
        <li>Supply chain disruptions</li><li>Crisis timeline</li></ul>
        <br><em>Updated every 15 minutes from source.</em>`,
    });
    this.getElement().classList.add('col-span-2', 'span-3', 'resized');
    this.init();
  }

  private init(): void {
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'hormuz-dashboard';
    this.contentEl.innerHTML = `<div class="hormuz-loading">${t('common.loading') || 'Loading...'}</div>`;
    this.content.appendChild(this.contentEl);

    initHormuzStatusTracking();
    registerHormuzStatusCallback(this.onData);
    this.timer = setInterval(() => {
      if (this.lastData) this.render(this.lastData);
    }, 60_000); // Re-render every minute to update duration counter
  }

  private onData = (data: HormuzStatusData): void => {
    this.lastData = data;
    this.setCount(data.traffic?.transitingNow ?? 0);
    this.render(data);
  };

  private render(data: HormuzStatusData): void {
    if (!this.contentEl) return;
    this.contentEl.innerHTML = `
      ${this.renderStatus(data.status)}
      ${this.renderTraffic(data.traffic)}
      ${this.renderCards(data.warRisk, data.lngImpact, data.supplyChain)}
      ${this.renderAltRoutes(data.alternativeRoutes)}
      ${this.renderPeaceTalks(data.peaceTalks)}
      ${this.renderTimeline(data.crisisTimeline)}
      ${this.renderNews(data.latestNews)}
      <div class="hormuz-footer">
        <span>hormuzstraitmonitor.com</span>
        <span>${data.fetchedAt ? new Date(data.fetchedAt).toLocaleTimeString() : ''}</span>
      </div>
    `;
  }

  private renderStatus(s: HormuzStraitStatus | null): string {
    if (!s) return '';
    const color = statusColor(s.state);
    const stateLabel = t(`panels.hormuzStatus.${s.state.toLowerCase()}`) || s.state;
    let duration = '';
    if (s.duration) {
      duration = `${s.duration.days}d ${s.duration.hours}h ${s.duration.minutes}m`;
    }
    return `
      <div class="hormuz-status-banner" style="border-left:4px solid ${color}">
        <div class="hormuz-status-state" style="color:${color}">${this.esc(stateLabel)}</div>
        ${s.since ? `<div class="hormuz-status-since">${t('panels.hormuzSince') || 'Since'} ${this.esc(s.since)}</div>` : ''}
        ${duration ? `<div class="hormuz-status-duration">${duration}</div>` : ''}
      </div>
    `;
  }

  private renderTraffic(tr: HormuzTrafficData | null): string {
    if (!tr) return '';
    const pct = tr.pctOfNormal ?? 0;
    const barColor = pct > 70 ? '#4ecdc4' : pct > 30 ? '#fbbf24' : '#ff6b35';
    return `
      <div class="hormuz-traffic-overview">
        <div class="hormuz-traffic-metric">
          <span class="hormuz-traffic-val">${tr.transitingNow ?? '--'}</span>
          <span class="hormuz-traffic-label">${t('panels.hormuzTransitingNow') || 'Transiting Now'}</span>
        </div>
        <div class="hormuz-traffic-metric">
          <span class="hormuz-traffic-val">${tr.last24h ?? '--'}</span>
          <span class="hormuz-traffic-label">${t('panels.hormuzLast24h') || 'Last 24h'}</span>
        </div>
        <div class="hormuz-traffic-metric">
          <span class="hormuz-traffic-val">${tr.normalAvg ?? '--'}</span>
          <span class="hormuz-traffic-label">${t('panels.hormuzNormalAvg') || 'Normal Avg'}</span>
        </div>
        <div class="hormuz-traffic-metric">
          <span class="hormuz-traffic-val" style="color:${barColor}">${pct}%</span>
          <span class="hormuz-traffic-label">${t('panels.hormuzThroughput') || 'Throughput'}</span>
        </div>
      </div>
      ${pct > 0 ? `
        <div class="hormuz-throughput-bar">
          <div class="hormuz-throughput-fill" style="width:${Math.min(pct, 100)}%;background:${barColor}"></div>
        </div>
      ` : ''}
    `;
  }

  private renderCards(wr: HormuzWarRisk | null, lng: HormuzLngImpact | null, sc: HormuzSupplyChain | null): string {
    const cards: string[] = [];

    if (wr) {
      const levelColor = (wr.level || '').toUpperCase() === 'EXTREME' ? '#ef4444' :
        (wr.level || '').toUpperCase() === 'HIGH' ? '#ff6b35' : '#fbbf24';
      const levelLabel = t(`panels.hormuzWarRiskLevel.${(wr.level || '').toLowerCase()}`) || wr.level || '--';
      cards.push(`
        <div class="hormuz-card">
          <div class="hormuz-card-title">${t('panels.hormuzWarRisk') || 'War Risk Insurance'}</div>
          <div class="hormuz-card-value" style="color:${levelColor}">${this.esc(levelLabel)}</div>
          <div class="hormuz-card-detail">
            ${wr.premium ? `${t('panels.hormuzPremium') || 'Premium'}: ${wr.premium}%` : ''}
            ${wr.multiplier ? ` (${wr.multiplier}x)` : ''}
          </div>
        </div>
      `);
    }

    if (lng) {
      cards.push(`
        <div class="hormuz-card">
          <div class="hormuz-card-title">${t('panels.hormuzLngImpact') || 'LNG Impact'}</div>
          <div class="hormuz-card-value">${lng.lngPctAtRisk ?? '--'}%</div>
          <div class="hormuz-card-detail">
            ${t('panels.hormuzWorldLng') || 'World LNG at risk'}
          </div>
        </div>
      `);
    }

    if (sc) {
      cards.push(`
        <div class="hormuz-card">
          <div class="hormuz-card-title">${t('panels.hormuzSupplyChain') || 'Supply Chain'}</div>
          <div class="hormuz-card-value">${sc.shippingRateIncrease ? `+${sc.shippingRateIncrease}%` : '--'}</div>
          <div class="hormuz-card-detail">
            ${t('panels.hormuzShippingRates') || 'Shipping Rates'}
            ${sc.freightersStuck ? ` · ${sc.freightersStuck} ${t('panels.hormuzFreightersStuck') || 'freighters stuck'}` : ''}
          </div>
        </div>
      `);
    }

    if (sc?.sprDays) {
      cards.push(`
        <div class="hormuz-card hormuz-card-small">
          <div class="hormuz-card-title">${t('panels.hormuzSPR') || 'SPR Reserve'}</div>
          <div class="hormuz-card-value">${sc.sprDays}${t('panels.hormuzDays') || 'd'}</div>
        </div>
      `);
    }

    if (sc?.cpiImpact) {
      cards.push(`
        <div class="hormuz-card hormuz-card-small">
          <div class="hormuz-card-title">${t('panels.hormuzCPI') || 'CPI Impact'}</div>
          <div class="hormuz-card-value">+${sc.cpiImpact}%</div>
        </div>
      `);
    }

    if (cards.length === 0) return '';
    return `<div class="hormuz-cards">${cards.join('')}</div>`;
  }

  private renderAltRoutes(routes: HormuzAlternativeRoute[]): string {
    if (routes.length === 0) return '';
    return `
      <div class="hormuz-section">
        <div class="hormuz-section-title">${t('panels.hormuzAltRoutes') || 'Alternative Routes'}</div>
        <div class="hormuz-alt-routes">
          ${routes.map(r => `
            <div class="hormuz-alt-route">
              <strong>${this.esc(r.name)}</strong>
              ${r.extraDays ? `<span class="hormuz-alt-detail">+${r.extraDays}d</span>` : ''}
              ${r.extraCost ? `<span class="hormuz-alt-detail">+$${r.extraCost}</span>` : ''}
              ${r.capacity ? `<span class="hormuz-alt-detail">${this.esc(r.capacity)}</span>` : ''}
              ${r.status ? `<span class="hormuz-alt-detail">${this.esc(r.status)}</span>` : ''}
              ${r.coverage ? `<span class="hormuz-alt-detail">${this.esc(r.coverage)}</span>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderPeaceTalks(pt: HormuzPeaceTalks | null): string {
    if (!pt) return '';
    const statusColor = pt.status === 'IN PROGRESS' ? '#4ecdc4' : '#fbbf24';
    return `
      <div class="hormuz-section">
        <div class="hormuz-section-title">${t('panels.hormuzPeaceTalks') || 'Peace Talks'}</div>
        <div class="hormuz-peace-talks">
          <span class="hormuz-peace-status" style="color:${statusColor}">${this.esc(pt.status)}</span>
          ${pt.location ? `<span class="hormuz-peace-detail">${this.esc(pt.location)}</span>` : ''}
          ${pt.usLead ? `<span class="hormuz-peace-detail">US: ${this.esc(pt.usLead)}</span>` : ''}
          ${pt.iranLead ? `<span class="hormuz-peace-detail">IR: ${this.esc(pt.iranLead)}</span>` : ''}
        </div>
      </div>
    `;
  }

  private renderTimeline(events: HormuzTimelineEvent[]): string {
    if (events.length === 0) return '';
    const typeColors: Record<string, string> = {
      MILITARY: '#ef4444',
      ESCALATION: '#ff6b35',
      DIPLOMATIC: '#4ecdc4',
      POLITICAL: '#45b7d1',
      ECONOMIC: '#fbbf24',
      NAVAL: '#c084fc',
    };
    return `
      <div class="hormuz-section">
        <div class="hormuz-section-title">${t('panels.hormuzCrisisTimeline') || 'Crisis Timeline'}</div>
        <div class="hormuz-timeline">
          ${events.slice(0, 8).map(e => {
            const tc = typeColors[e.type.toUpperCase()] || '#94a3b8';
            const typeLabel = t(`panels.hormuzEventType.${e.type.toLowerCase()}`) || e.type;
            return `
              <div class="hormuz-timeline-item">
                <span class="hormuz-timeline-dot" style="background:${tc}"></span>
                <span class="hormuz-timeline-date">${this.esc(e.date)}</span>
                <span class="hormuz-timeline-type" style="color:${tc}">${this.esc(typeLabel)}</span>
                <span class="hormuz-timeline-desc">${this.esc(e.description.substring(0, 120))}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  private renderNews(news: HormuzNewsItem[]): string {
    if (news.length === 0) return '';
    return `
      <div class="hormuz-section">
        <div class="hormuz-section-title">${t('panels.hormuzLatestNews') || 'Latest News'}</div>
        <div class="hormuz-news-list">
          ${news.slice(0, 6).map(n => `
            <a class="hormuz-news-item" href="${this.esc(n.url)}" target="_blank" rel="noopener noreferrer">
              ${this.esc(n.title)}
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }

  private esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  public override destroy(): void {
    super.destroy();
    if (this.timer) clearInterval(this.timer);
    unregisterHormuzStatusCallback(this.onData);
  }
}
