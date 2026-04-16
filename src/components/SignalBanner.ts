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

const TYPE_ICONS: Record<string, string> = {
  velocity_spike: '🔥',
  keyword_spike: '📊',
  prediction_leads_news: '🔮',
  silent_divergence: '🔇',
  convergence: '◉',
  triangulation: '△',
  flow_drop: '🛢️',
  flow_price_divergence: '📈',
  geo_convergence: '🌐',
  explained_market_move: '✓',
  sector_cascade: '📊',
  military_surge: '🛩️',
};

export class SignalBanner {
  private container: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private shownIds = new Set<string>();
  private onNavigate?: (panelId: string) => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'signal-banner-bar';
    this.container.style.display = 'none';

    // Insert after header, before main-content
    const app = document.getElementById('app');
    const mainContent = app?.querySelector('.main-content');
    if (app && mainContent) {
      app.insertBefore(this.container, mainContent);
    } else {
      document.body.appendChild(this.container);
    }
  }

  /** Set a callback to scroll/navigate to a panel */
  setNavigateHandler(handler: (panelId: string) => void): void {
    this.onNavigate = handler;
  }

  show(signals: CorrelationSignal[]): void {
    if (!signals.length) return;

    const fresh = signals.filter(s => !this.shownIds.has(s.id));
    if (!fresh.length) return;

    for (const s of fresh) this.shownIds.add(s.id);
    if (this.shownIds.size > 200) {
      const arr = [...this.shownIds];
      this.shownIds = new Set(arr.slice(arr.length - 100));
    }

    const top = [...fresh].sort((a, b) => b.confidence - a.confidence)[0]!;
    const color = TYPE_COLORS[top.type] ?? 'var(--accent)';
    const icon = TYPE_ICONS[top.type] ?? '📡';
    const category = top.id.startsWith('news-') ? top.id.split('-')[1] : '';

    this.container.innerHTML = `
      <div class="signal-banner-inner" style="--banner-color: ${color}">
        <span class="signal-banner-icon">${icon}</span>
        <span class="signal-banner-dot" style="background:${color}"></span>
        <div class="signal-banner-body">
          <span class="signal-banner-title">${escapeHtml(top.title)}</span>
          <span class="signal-banner-desc">${escapeHtml(top.description)}</span>
        </div>
        ${category ? `<button class="signal-banner-go" data-panel="${escapeHtml(category)}">View →</button>` : ''}
        <button class="signal-banner-close">&times;</button>
      </div>
    `;

    this.container.style.display = '';
    requestAnimationFrame(() => this.container.classList.add('visible'));

    this.container.querySelector('.signal-banner-close')?.addEventListener('click', () => this.dismiss(), { once: true });
    this.container.querySelector('.signal-banner-go')?.addEventListener('click', (e) => {
      const panelId = (e.currentTarget as HTMLElement).dataset.panel;
      if (panelId && this.onNavigate) this.onNavigate(panelId);
      this.dismiss();
    }, { once: true });

    this.resetTimer();
  }

  private dismiss(): void {
    this.container.classList.remove('visible');
    setTimeout(() => { this.container.style.display = 'none'; }, 300);
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
