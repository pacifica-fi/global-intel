import { Panel } from './Panel';
import { t } from '@/services/i18n';
import { escapeHtml } from '@/utils/sanitize';

interface CoinMarketItem {
  id: string;
  symbol: string;
  name: string;
  currentPrice: number;
  marketCap: number;
  volume24h: number;
  change24h: number;
  sparkline7d: number[];
  high24h: number;
  low24h: number;
}

interface CryptoChannelsData {
  timestamp: string;
  coins: CoinMarketItem[];
  stablecoinMarketCap: number;
}

const TRACKED_IDS = [
  'bitcoin',
  'ethereum',
  'tether',
  'binancecoin',
  'solana',
  'ripple',
  'usd-coin',
  'cardano',
  'dogecoin',
  'tron',
  'avalanche-2',
  'chainlink',
];
const PANEL_SPANS_KEY = 'worldmonitor-panel-spans';
const PANEL_ID = 'crypto-channels';

function asNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatCompactUsd(value: number): string {
  if (Math.abs(value) >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${Math.round(value).toLocaleString()}`;
}

function formatPercent(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

function formatPrice(value: number): string {
  if (value >= 1) return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (value >= 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(6)}`;
}

// --- SVG / HTML Builders ---

function buildMiniSparklineSvg(data: number[], w = 36, h = 14): string {
  if (!data || data.length < 2) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const lastChange = data[data.length - 1]! - data[0]!;
  const color = lastChange >= 0 ? '#02bd75' : '#e0345c';
  const points = data
    .map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - ((v - min) / range) * (h - 2) - 1).toFixed(1)}`)
    .join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="crypto-mini-sparkline"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleRad: number): { x: number; y: number } {
  return { x: cx + radius * Math.cos(angleRad), y: cy + radius * Math.sin(angleRad) };
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function buildPieChartSvg(slices: Array<{ label: string; value: number; color: string }>, centerLabel: string): string {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const w = 110;
  const h = 110;
  const cx = 55;
  const cy = 55;
  const r = 46;
  const ir = 24;

  if (total <= 0) {
    return `<svg viewBox="0 0 ${w} ${h}" class="crypto-share-chart"><circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,0.05)" /><text x="${cx}" y="${cy}" text-anchor="middle" class="crypto-pie-center">${escapeHtml(centerLabel)}</text></svg>`;
  }

  let start = -Math.PI / 2;
  const paths = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const angle = (s.value / total) * Math.PI * 2;
      const end = start + angle;
      const outer = arcPath(cx, cy, r, start, end);
      const inner = arcPath(cx, cy, ir, end, start);
      const seg = `${outer} L ${inner}`;
      start = end;
      return `<path d="${seg}" fill="${s.color}" fill-opacity="0.85"></path>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${w} ${h}" class="crypto-share-chart">${paths}<circle cx="${cx}" cy="${cy}" r="${ir - 1}" fill="var(--overlay-subtle)" /><text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="central" class="crypto-pie-center">${escapeHtml(centerLabel)}</text></svg>`;
}

function buildHeatmapCells(coins: CoinMarketItem[]): string {
  const sorted = [...coins].sort((a, b) => b.change24h - a.change24h);
  return sorted
    .map((c) => {
      const abs = Math.abs(c.change24h);
      const dir = c.change24h >= 0 ? 'up' : 'down';
      let intensity: number;
      if (abs >= 5) intensity = 4;
      else if (abs >= 3) intensity = 3;
      else if (abs >= 1.5) intensity = 2;
      else if (abs >= 0.5) intensity = 1;
      else intensity = 0;
      const cls = intensity > 0 ? `crypto-heat-${dir}-${intensity}` : '';
      return `<div class="crypto-heat-cell ${cls}">
        <span class="crypto-heat-sym">${escapeHtml(c.symbol)}</span>
        <span class="crypto-heat-val" style="color:${c.change24h >= 0 ? '#02bd75' : '#e0345c'}">${formatPercent(c.change24h)}</span>
      </div>`;
    })
    .join('');
}

function buildGaugeSvg(percent: number, label: string): string {
  const w = 120;
  const h = 68;
  const cx = 60;
  const cy = 56;
  const r = 44;
  const lw = 8;
  const startAngle = Math.PI;
  const endAngle = 0;
  const pctAngle = startAngle + (endAngle - startAngle) * Math.min(Math.max(percent, 0), 100) / 100;

  const bgPath = arcPath(cx, cy, r, startAngle, endAngle);
  const fgPath = arcPath(cx, cy, r, startAngle, pctAngle);

  return `<svg viewBox="0 0 ${w} ${h}" class="crypto-gauge-svg">
    <path d="${bgPath}" fill="none" stroke="var(--overlay-light)" stroke-width="${lw}" stroke-linecap="round"></path>
    <path d="${fgPath}" fill="none" stroke="#f7931a" stroke-width="${lw}" stroke-linecap="round"></path>
    <text x="${cx}" y="${cy - 10}" text-anchor="middle" class="crypto-gauge-val">${percent.toFixed(1)}%</text>
    <text x="${cx}" y="${cy + 2}" text-anchor="middle" class="crypto-gauge-label">${escapeHtml(label)}</text>
  </svg>`;
}

export class CryptoChannelsPanel extends Panel {
  private data: CryptoChannelsData | null = null;
  private loading = true;
  private error: string | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({ id: PANEL_ID, title: t('panels.cryptoChannels'), showCount: false });
    const saved = localStorage.getItem(PANEL_SPANS_KEY);
    let spans: Record<string, number> = {};
    try {
      spans = saved ? (JSON.parse(saved) as Record<string, number>) : {};
    } catch {
      spans = {};
    }
    const currentSpan = spans[PANEL_ID];
    if (!currentSpan || currentSpan === 4) {
      this.getElement().classList.remove('span-1', 'span-2', 'span-3', 'span-4');
      this.getElement().classList.add('span-2', 'resized');
      spans[PANEL_ID] = 2;
      localStorage.setItem(PANEL_SPANS_KEY, JSON.stringify(spans));
    }
    this.getElement().classList.add('col-span-2');
    void this.fetchData();
    this.refreshInterval = setInterval(() => void this.fetchData(), 4 * 60 * 1000);
  }

  public destroy(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private async fetchData(): Promise<void> {
    try {
      const marketsUrl = `/api/coingecko?endpoint=markets&vs_currencies=usd&ids=${TRACKED_IDS.join(',')}&sparkline=true`;
      const [marketsRes, stableRes] = await Promise.allSettled([fetch(marketsUrl), fetch('/api/stablecoin-markets')]);

      if (marketsRes.status !== 'fulfilled' || !marketsRes.value.ok) {
        throw new Error('markets unavailable');
      }

      const marketsJson = (await marketsRes.value.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(marketsJson)) throw new Error('markets malformed');

      const coins: CoinMarketItem[] = marketsJson
        .map((row) => ({
          id: String(row.id || ''),
          symbol: String(row.symbol || '').toUpperCase(),
          name: String(row.name || ''),
          currentPrice: asNumber(row.current_price),
          marketCap: asNumber(row.market_cap),
          volume24h: asNumber(row.total_volume),
          change24h: asNumber(row.price_change_percentage_24h),
          high24h: asNumber(row.high_24h),
          low24h: asNumber(row.low_24h),
          sparkline7d: Array.isArray(
            (row.sparkline_in_7d as { price: number[] } | undefined)?.price,
          )
            ? ((row.sparkline_in_7d as { price: number[] }).price as number[]).slice(-48)
            : [],
        }))
        .filter((coin) => coin.id && coin.symbol);

      let stablecoinMarketCap = 0;
      if (stableRes.status === 'fulfilled' && stableRes.value.ok) {
        const stableJson = (await stableRes.value.json()) as {
          summary?: { totalMarketCap?: number };
          unavailable?: boolean;
        };
        if (!stableJson?.unavailable) {
          stablecoinMarketCap = asNumber(stableJson?.summary?.totalMarketCap);
        }
      }

      this.data = { timestamp: new Date().toISOString(), coins, stablecoinMarketCap };
      this.error = null;
    } catch {
      this.error = t('common.failedToLoad');
    } finally {
      this.loading = false;
      this.renderPanel();
    }
  }

  private renderPanel(): void {
    if (this.loading) {
      this.showLoading(t('common.loadingCryptoChannels'));
      return;
    }

    if (this.error || !this.data) {
      this.showError(this.error || t('common.noDataShort'));
      return;
    }

    if (!this.data.coins.length) {
      this.showError(t('common.noDataShort'));
      return;
    }

    const coins = this.data.coins;
    const byMarketCap = [...coins].sort((a, b) => b.marketCap - a.marketCap);
    const byVolume = [...coins].sort((a, b) => b.volume24h - a.volume24h);
    const byChange = [...coins].sort((a, b) => b.change24h - a.change24h);
    const topVolume = byVolume.slice(0, 6);

    // Computed metrics
    const trackedMarketCap = byMarketCap.reduce((s, c) => s + c.marketCap, 0);
    const totalVolume = coins.reduce((s, c) => s + c.volume24h, 0);
    const avgMove = coins.reduce((s, c) => s + c.change24h, 0) / coins.length;
    const advancers = coins.filter((c) => c.change24h > 0).length;
    const decliners = coins.filter((c) => c.change24h < 0).length;
    const btcCap = byMarketCap.find((c) => c.id === 'bitcoin')?.marketCap || 0;
    const ethCap = byMarketCap.find((c) => c.id === 'ethereum')?.marketCap || 0;
    const stableCap = this.data.stablecoinMarketCap;
    const otherCap = Math.max(trackedMarketCap - btcCap - ethCap, 0);
    const trackedPlusStable = trackedMarketCap + Math.max(stableCap, 0);
    const stableShare = trackedPlusStable > 0 ? (stableCap / trackedPlusStable) * 100 : 0;
    const btcDom = trackedMarketCap > 0 ? (btcCap / trackedMarketCap) * 100 : 0;
    const volToMcap = trackedMarketCap > 0 ? (totalVolume / trackedMarketCap) * 100 : 0;
    const upVolume = coins.filter((c) => c.change24h > 0).reduce((s, c) => s + c.volume24h, 0);
    const downVolume = coins.filter((c) => c.change24h <= 0).reduce((s, c) => s + c.volume24h, 0);
    const totalVolSignal = upVolume + downVolume || 1;
    const bestPerformer = byChange[0];
    const worstPerformer = byChange[byChange.length - 1];

    // --- Q1: Coin Table ---
    const tableRows = byMarketCap
      .map(
        (c) => `<tr class="crypto-row">
        <td class="crypto-coin-sym">${escapeHtml(c.symbol)}</td>
        <td class="crypto-coin-price">${formatPrice(c.currentPrice)}</td>
        <td class="crypto-coin-change" style="color:${c.change24h >= 0 ? '#02bd75' : '#e0345c'}">${formatPercent(c.change24h)}</td>
        <td class="crypto-coin-vol">${formatCompactUsd(c.volume24h)}</td>
        <td class="crypto-coin-mcap">${formatCompactUsd(c.marketCap)}</td>
        <td>${buildMiniSparklineSvg(c.sparkline7d)}</td>
      </tr>`,
      )
      .join('');

    // --- Q2: Volume bars + Pie ---
    const maxVol = Math.max(...topVolume.map((c) => c.volume24h), 1);
    const volumeBars = topVolume
      .map((c) => {
        const pct = (c.volume24h / maxVol) * 100;
        const color = c.change24h >= 0 ? '#02bd75' : '#e0345c';
        return `<div class="crypto-hbar-row">
          <span class="crypto-hbar-label">${escapeHtml(c.symbol)}</span>
          <div class="crypto-hbar-track"><div class="crypto-hbar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
          <span class="crypto-hbar-val">${formatCompactUsd(c.volume24h)}</span>
        </div>`;
      })
      .join('');

    const pieSlices = [
      { label: 'BTC', value: btcCap, color: '#f7931a' },
      { label: 'ETH', value: ethCap, color: '#627eea' },
      { label: 'Stable', value: stableCap, color: '#00bfa5' },
      { label: 'Others', value: otherCap, color: '#8c9eff' },
    ];
    const pieSvg = buildPieChartSvg(pieSlices, formatCompactUsd(trackedPlusStable));
    const pieLegend = pieSlices
      .filter((s) => s.value > 0)
      .map((s) => {
        const ratio = trackedPlusStable > 0 ? (s.value / trackedPlusStable) * 100 : 0;
        return `<div class="crypto-legend-item"><span class="crypto-legend-dot" style="background:${s.color}"></span><span class="crypto-legend-name">${escapeHtml(s.label)}</span><span class="crypto-legend-value">${ratio.toFixed(1)}%</span></div>`;
      })
      .join('');

    // --- Q3: Heatmap ---
    const heatmapHtml = buildHeatmapCells(coins);

    // --- Q4: Gauge + Volume Ratio ---
    const gaugeSvg = buildGaugeSvg(btcDom, 'BTC Dominance');
    const upPct = (upVolume / totalVolSignal) * 100;

    const html = `
      <div class="crypto-channels-container">
        <div class="crypto-summary-ribbon">
          <div class="crypto-metric-pill">
            <span class="crypto-metric-label">${t('components.cryptoChannels.trackedMcap')}</span>
            <span class="crypto-metric-value">${formatCompactUsd(trackedMarketCap)}</span>
          </div>
          <div class="crypto-metric-pill">
            <span class="crypto-metric-label">${t('components.cryptoChannels.totalVolume')}</span>
            <span class="crypto-metric-value">${formatCompactUsd(totalVolume)}</span>
          </div>
          <div class="crypto-metric-pill">
            <span class="crypto-metric-label">${t('components.cryptoChannels.btcDom')}</span>
            <span class="crypto-metric-value">${btcDom.toFixed(1)}%</span>
          </div>
          <div class="crypto-metric-pill">
            <span class="crypto-metric-label">${t('components.cryptoChannels.breadth')}</span>
            <span class="crypto-metric-value"><span style="color:#02bd75">${advancers}↑</span> / <span style="color:#e0345c">${decliners}↓</span></span>
          </div>
          <div class="crypto-metric-pill">
            <span class="crypto-metric-label">${t('components.cryptoChannels.avgMove')}</span>
            <span class="crypto-metric-value" style="color:${avgMove >= 0 ? '#02bd75' : '#e0345c'}">${formatPercent(avgMove)}</span>
          </div>
          <div class="crypto-metric-pill">
            <span class="crypto-metric-label">${t('components.cryptoChannels.volMcap')}</span>
            <span class="crypto-metric-value">${volToMcap.toFixed(2)}%</span>
          </div>
        </div>

        <div class="crypto-quadrant-grid">
          <div class="crypto-quadrant">
            <div class="crypto-q-title">${t('components.cryptoChannels.trackedAssets')}</div>
            <div class="crypto-table-wrap">
              <table class="crypto-coin-table">
                <thead><tr>
                  <th>Symbol</th><th>Price</th><th>24h</th><th>Vol</th><th>MCap</th><th>7d</th>
                </tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
          </div>
          <div class="crypto-quadrant">
            <div class="crypto-q-title">${t('components.cryptoChannels.volComposition')}</div>
            <div class="crypto-q-section">${volumeBars}</div>
            <div class="crypto-q-sep"></div>
            <div class="crypto-pie-row">
              ${pieSvg}
              <div class="crypto-legend">${pieLegend}</div>
            </div>
          </div>
          <div class="crypto-quadrant">
            <div class="crypto-q-title">${t('components.cryptoChannels.performance')}</div>
            <div class="crypto-heatmap">${heatmapHtml}</div>
          </div>
          <div class="crypto-quadrant">
            <div class="crypto-q-title">${t('components.cryptoChannels.marketStructure')}</div>
            <div class="crypto-gauge-wrap">${gaugeSvg}</div>
            <div class="crypto-q-sep"></div>
            <div class="crypto-volratio-section">
              <div class="crypto-volratio-header">
                <span class="crypto-volratio-label">${t('components.cryptoChannels.upVol')}</span>
                <span class="crypto-volratio-val" style="color:#02bd75">${formatCompactUsd(upVolume)}</span>
                <span class="crypto-volratio-label" style="margin-left:8px">${t('components.cryptoChannels.downVol')}</span>
                <span class="crypto-volratio-val" style="color:#e0345c">${formatCompactUsd(downVolume)}</span>
              </div>
              <div class="crypto-volratio-bar">
                <div class="crypto-volratio-up" style="width:${upPct.toFixed(1)}%"></div>
                <div class="crypto-volratio-down" style="width:${(100 - upPct).toFixed(1)}%"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="crypto-channels-footer">
          <span>${t('components.cryptoChannels.stableShare')}: ${stableShare.toFixed(1)}%</span>
          <span>
            <span style="color:#02bd75">${escapeHtml(bestPerformer?.symbol ?? '')} ${formatPercent(bestPerformer?.change24h ?? 0)}</span>
            &nbsp;/&nbsp;
            <span style="color:#e0345c">${escapeHtml(worstPerformer?.symbol ?? '')} ${formatPercent(worstPerformer?.change24h ?? 0)}</span>
          </span>
          <span>${t('components.cryptoChannels.updated')}: ${new Date(this.data.timestamp).toLocaleTimeString()}</span>
        </div>
      </div>
    `;

    this.content.innerHTML = '';
    this.setContent(html);
  }
}
