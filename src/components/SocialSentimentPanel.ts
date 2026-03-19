import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { fetchSentimentData, type SentimentData, type SocialPost } from '@/services/social-sentiment';

export class SocialSentimentPanel extends Panel {
  private data: SentimentData | null = null;
  private loadingEl: HTMLElement | null = null;

  constructor() {
    super({
      id: 'social-sentiment',
      title: t('panels.socialSentiment'),
      showCount: true,
      trackActivity: true,
      infoTooltip: 'Reddit + Bluesky geopolitical/market sentiment',
    });
    this.init();
  }

  private async init(): Promise<void> {
    this.loadingEl = document.createElement('div');
    this.loadingEl.className = 'panel-loading';
    this.loadingEl.textContent = 'Loading...';
    this.content.appendChild(this.loadingEl);
    
    await this.loadData();
  }

  private async loadData(): Promise<void> {
    try {
      this.data = await fetchSentimentData();
      this.render();
    } catch (e) {
      console.error('Social Sentiment error:', e);
      this.showError();
    }
  }

  private render(): void {
    if (!this.data) return;
    
    this.loadingEl?.remove();
    
    const container = document.createElement('div');
    container.className = 'sentiment-panel';

    // Sentiment breakdown
    const breakdown = document.createElement('div');
    breakdown.className = 'sentiment-breakdown';
    breakdown.innerHTML = `
      <div class="sentiment-bullish">
        <span class="count">${this.data.sentimentBreakdown.bullish}</span>
        <span class="label">Bullish 📈</span>
      </div>
      <div class="sentiment-neutral">
        <span class="count">${this.data.sentimentBreakdown.neutral}</span>
        <span class="label">Neutral ➡️</span>
      </div>
      <div class="sentiment-bearish">
        <span class="count">${this.data.sentimentBreakdown.bearish}</span>
        <span class="label">Bearish 📉</span>
      </div>
    `;
    container.appendChild(breakdown);

    // Top topics
    const topics = document.createElement('div');
    topics.className = 'sentiment-topics';
    topics.innerHTML = `<span class="topics-label">Trending:</span> ${this.data.topTopics.slice(0, 5).map(t => `<span class="topic-tag">${escapeHtml(t)}</span>`).join('')}`;
    container.appendChild(topics);

    // Posts list
    const list = document.createElement('div');
    list.className = 'sentiment-list';
    this.data.posts.slice(0, 10).forEach(post => {
      const item = document.createElement('div');
      item.className = `sentiment-item ${post.sentiment}`;
      item.innerHTML = `
        <span class="platform">${post.platform === 'reddit' ? ' Reddit' : ' Bluesky'}</span>
        <span class="author">${escapeHtml(post.author)}</span>
        <span class="text">${escapeHtml(post.text.slice(0, 100))}</span>
      `;
      list.appendChild(item);
    });
    container.appendChild(list);

    this.content.appendChild(container);
    this.updateCount(this.data.totalPosts);
  }

  private showError(): void {
    this.loadingEl?.remove();
    this.content.innerHTML = '<div class="panel-error">Failed to load sentiment data</div>';
  }
}
