import type { CorrelationSignal } from '@/services/correlation';
import { escapeHtml } from '@/utils/sanitize';

const DISMISS_MS = 10_000;

const TYPE_COLORS: Record<string, string> = {
  velocity_spike: 'var(--red)',
  keyword_spike: 'var(--semantic-high)',
  prediction_leads_news: 'var(--yellow)',
  silent_divergence: 'var(--green)',
  convergence: 'var(--defcon-4)',
  triangulation: 'var(--semantic-high)',
  flow_drop: 'var(--semantic-info)',
  flow_price_divergence: 'var(--semantic-normal)',
  geo_convergence: 'var(--semantic-info)',
  explained_market_move: 'var(--green)',
  sector_cascade: 'var(--semantic-high)',
  military_surge: 'var(--red)',
};

export class SignalBanner {
  private container: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'signal-banner-container';
    this.container.style.display = 'none';
    document.body.appendChild(this.container);
  }

  show(signals: CorrelationSignal[]): void {
    if (!signals.length) return;

    // Show only the highest-confidence signal
    const sorted = [...signals].sort((a, b) => b.confidence - a.confidence);
    const top = sorted[0]!;
    const color = TYPE_COLORS[top.type] ?? 'var(--accent)';

    this.container.innerHTML = `
      <div class="signal-banner" style="--banner-color: ${color}">
        <span class="signal-banner-dot"></span>
        <span class="signal-banner-text">${escapeHtml(top.title)}</span>
        <button class="signal-banner-close">&times;</button>
      </div>
    `;

    this.container.style.display = '';
    requestAnimationFrame(() => this.container.classList.add('visible'));

    this.container.querySelector('.signal-banner-close')?.addEventListener('click', () => this.dismiss(), { once: true });

    this.resetTimer();
  }

  private dismiss(): void {
    this.container.classList.remove('visible');
    setTimeout(() => { this.container.style.display = 'none'; }, 400);
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.dismiss(), DISMISS_MS);
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.container.remove();
  }
}
