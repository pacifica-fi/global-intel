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

function buildBarChartSvg(items: CoinMarketItem[]): string {
  const width = 420;
  const height = 190;
  const paddingTop = 16;
  const paddingRight = 12;
  const paddingBottom = 42;
  const paddingLeft = 12;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const maxVolume = Math.max(...items.map((item) => item.volume24h), 1);
  const step = plotWidth / items.length;
  const barWidth = Math.max(18, step * 0.62);

  const bars = items
    .map((item, index) => {
      const volume = Math.max(item.volume24h, 0);
      const barHeight = (volume / maxVolume) * plotHeight;
      const x = paddingLeft + step * index + (step - barWidth) / 2;
      const y = paddingTop + plotHeight - barHeight;
      const color = item.change24h >= 0 ? '#02bd75' : '#e0345c';
      const labelX = x + barWidth / 2;
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="4" fill="${color}" fill-opacity="0.86"></rect>
        <text x="${labelX.toFixed(1)}" y="${(height - 20).toFixed(1)}" text-anchor="middle" class="crypto-bar-label">${escapeHtml(item.symbol.toUpperCase())}</text>
      `;
    })
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="crypto-volume-chart" role="img" aria-label="${escapeHtml(t('components.cryptoChannels.volumeChannel'))}">
      <line x1="${paddingLeft}" y1="${paddingTop + plotHeight}" x2="${width - paddingRight}" y2="${paddingTop + plotHeight}" stroke="rgba(255,255,255,0.18)" stroke-width="1"></line>
      ${bars}
    </svg>
  `;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleRad: number): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad),
  };
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
}

function buildPieChartSvg(slices: Array<{ label: string; value: number; color: string }>, centerLabel: string): string {
  const total = slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0);
  const width = 220;
  const height = 220;
  const cx = 110;
  const cy = 110;
  const radius = 82;

  if (total <= 0) {
    return `
      <svg viewBox="0 0 ${width} ${height}" class="crypto-share-chart">
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
        <text x="${cx}" y="${cy}" text-anchor="middle" class="crypto-pie-center">${escapeHtml(centerLabel)}</text>
      </svg>
    `;
  }

  let start = -Math.PI / 2;
  const paths = slices
    .filter((slice) => slice.value > 0)
    .map((slice) => {
      const angle = (slice.value / total) * Math.PI * 2;
      const end = start + angle;
      const path = arcPath(cx, cy, radius, start, end);
      start = end;
      return `<path d="${path}" fill="${slice.color}" fill-opacity="0.88"></path>`;
    })
    .join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="crypto-share-chart" role="img" aria-label="${escapeHtml(t('components.cryptoChannels.mcapChannel'))}">
      ${paths}
      <circle cx="${cx}" cy="${cy}" r="43" fill="rgba(5,10,15,0.9)"></circle>
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="crypto-pie-center">${escapeHtml(centerLabel)}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="crypto-pie-sub">${escapeHtml(t('components.cryptoChannels.shares'))}</text>
    </svg>
  `;
}

export class CryptoChannelsPanel extends Panel {
  private data: CryptoChannelsData | null = null;
  private loading = true;
  private error: string | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super({ id: 'crypto-channels', title: t('panels.cryptoChannels'), showCount: false });
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
      const marketsUrl = `/api/coingecko?endpoint=markets&vs_currencies=usd&ids=${TRACKED_IDS.join(',')}`;
      const [marketsRes, stableRes] = await Promise.allSettled([
        fetch(marketsUrl),
        fetch('/api/stablecoin-markets'),
      ]);

      if (marketsRes.status !== 'fulfilled' || !marketsRes.value.ok) {
        throw new Error('markets unavailable');
      }

      const marketsJson = await marketsRes.value.json() as Array<Record<string, unknown>>;
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
        }))
        .filter((coin) => coin.id && coin.symbol);

      let stablecoinMarketCap = 0;
      if (stableRes.status === 'fulfilled' && stableRes.value.ok) {
        const stableJson = await stableRes.value.json() as { summary?: { totalMarketCap?: number }; unavailable?: boolean };
        if (!stableJson?.unavailable) {
          stablecoinMarketCap = asNumber(stableJson?.summary?.totalMarketCap);
        }
      }

      this.data = {
        timestamp: new Date().toISOString(),
        coins,
        stablecoinMarketCap,
      };
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

    const byMarketCap = [...this.data.coins].sort((a, b) => b.marketCap - a.marketCap);
    const byVolume = [...this.data.coins].sort((a, b) => b.volume24h - a.volume24h);
    const topVolume = byVolume.slice(0, 6);
    const trackedMarketCap = byMarketCap.reduce((sum, coin) => sum + coin.marketCap, 0);
    const avgMove = this.data.coins.reduce((sum, coin) => sum + coin.change24h, 0) / this.data.coins.length;
    const advancers = this.data.coins.filter((coin) => coin.change24h > 0).length;
    const decliners = this.data.coins.filter((coin) => coin.change24h < 0).length;
    const leader = byVolume[0];
    const btcCap = byMarketCap.find((coin) => coin.id === 'bitcoin')?.marketCap || 0;
    const ethCap = byMarketCap.find((coin) => coin.id === 'ethereum')?.marketCap || 0;
    const stableCap = this.data.stablecoinMarketCap;
    const otherTrackedCap = Math.max(trackedMarketCap - btcCap - ethCap, 0);
    const trackedPlusStable = trackedMarketCap + Math.max(stableCap, 0);
    const stableShare = trackedPlusStable > 0 ? (stableCap / trackedPlusStable) * 100 : 0;

    const pieSlices = [
      { label: 'BTC', value: btcCap, color: '#f7931a' },
      { label: 'ETH', value: ethCap, color: '#627eea' },
      { label: 'Stablecoins', value: stableCap, color: '#00bfa5' },
      { label: 'Others', value: otherTrackedCap, color: '#8c9eff' },
    ];

    const barChartSvg = buildBarChartSvg(topVolume);
    const pieChartSvg = buildPieChartSvg(pieSlices, formatCompactUsd(trackedPlusStable));

    const pieLegend = pieSlices
      .filter((slice) => slice.value > 0)
      .map((slice) => {
        const ratio = trackedPlusStable > 0 ? (slice.value / trackedPlusStable) * 100 : 0;
        return `
          <div class="crypto-legend-item">
            <span class="crypto-legend-dot" style="background:${slice.color}"></span>
            <span class="crypto-legend-name">${escapeHtml(slice.label)}</span>
            <span class="crypto-legend-value">${ratio.toFixed(1)}%</span>
          </div>
        `;
      })
      .join('');

    const html = `
      <div class="crypto-channels-container">
        <div class="crypto-channels-summary">
          <div class="crypto-summary-item">
            <span class="crypto-summary-label">${t('components.cryptoChannels.trackedMcap')}</span>
            <span class="crypto-summary-value">${formatCompactUsd(trackedMarketCap)}</span>
          </div>
          <div class="crypto-summary-item">
            <span class="crypto-summary-label">${t('components.cryptoChannels.breadth')}</span>
            <span class="crypto-summary-value">${advancers}↑ / ${decliners}↓</span>
          </div>
          <div class="crypto-summary-item">
            <span class="crypto-summary-label">${t('components.cryptoChannels.avgMove')}</span>
            <span class="crypto-summary-value ${avgMove >= 0 ? 'change-positive' : 'change-negative'}">${formatPercent(avgMove)}</span>
          </div>
          <div class="crypto-summary-item">
            <span class="crypto-summary-label">${t('components.cryptoChannels.leaderVolume')}</span>
            <span class="crypto-summary-value">${escapeHtml(leader?.symbol || 'N/A')} · ${formatCompactUsd(leader?.volume24h || 0)}</span>
          </div>
        </div>

        <div class="crypto-chart-grid">
          <div class="crypto-chart-card">
            <div class="crypto-chart-title">${t('components.cryptoChannels.volumeChannel')}</div>
            ${barChartSvg}
          </div>
          <div class="crypto-chart-card">
            <div class="crypto-chart-title">${t('components.cryptoChannels.mcapChannel')}</div>
            ${pieChartSvg}
            <div class="crypto-legend">${pieLegend}</div>
          </div>
        </div>

        <div class="crypto-channels-footer">
          <span>${t('components.cryptoChannels.stableShare')}: ${stableShare.toFixed(1)}%</span>
          <span>${t('components.cryptoChannels.updated')}: ${new Date(this.data.timestamp).toLocaleTimeString()}</span>
        </div>
      </div>
    `;

    this.setContent(html);
  }
}
