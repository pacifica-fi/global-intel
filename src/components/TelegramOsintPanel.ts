import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { fetchTelegramOsint, type TelegramOsintData, type TelegramOsintItem } from '@/services/telegram-osint';

export class TelegramOsintPanel extends Panel {
  private data: TelegramOsintData | null = null;
  private loadingEl: HTMLElement | null = null;

  constructor() {
    super({
      id: 'telegram-osint',
      title: t('panels.telegramOsint'),
      showCount: true,
      trackActivity: true,
      infoTooltip: 'Telegram OSINT channels for conflict zones and geopolitics',
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
      this.data = await fetchTelegramOsint();
      this.render();
    } catch (e) {
      console.error('Telegram OSINT error:', e);
      this.showError();
    }
  }

  private render(): void {
    if (!this.data) return;
    
    this.loadingEl?.remove();
    
    if (this.data.items.length === 0) {
      this.content.innerHTML = '<div class="panel-empty">No data available. Configure Telegram bot token for full access.</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'telegram-osint-list';

    this.data.items.slice(0, 20).forEach(item => {
      const card = document.createElement('div');
      card.className = `osint-card ${item.urgent ? 'urgent' : ''}`;
      
      const header = document.createElement('div');
      header.className = 'osint-header';
      header.innerHTML = `<span class="channel">${escapeHtml(item.label)}</span><span class="topic">${escapeHtml(item.topic)}</span>`;
      
      const text = document.createElement('div');
      text.className = 'osint-text';
      text.textContent = item.text.slice(0, 200);
      
      const footer = document.createElement('div');
      footer.className = 'osint-footer';
      footer.innerHTML = `<span class="views">👁 ${item.views}</span><span class="date">${item.date}</span>`;
      
      card.appendChild(header);
      card.appendChild(text);
      card.appendChild(footer);
      list.appendChild(card);
    });

    this.content.appendChild(list);
    this.updateCount(this.data.items.length);
  }

  private showError(): void {
    this.loadingEl?.remove();
    this.content.innerHTML = '<div class="panel-error">Failed to load Telegram OSINT data</div>';
  }
}
