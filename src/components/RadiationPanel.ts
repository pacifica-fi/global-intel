import { Panel } from './Panel';
import { t } from '@/services/i18n';
import { fetchRadiationData, type RadiationData } from '@/services/radiation';

export class RadiationPanel extends Panel {
  private data: RadiationData | null = null;
  private loadingEl: HTMLElement | null = null;

  constructor() {
    super({
      id: 'radiation',
      title: t('panels.radiation'),
      showCount: true,
      trackActivity: true,
      infoTooltip: 'Safecast + EPA RadNet radiation monitoring',
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
      this.data = await fetchRadiationData();
      this.render();
    } catch (e) {
      console.error('Radiation error:', e);
      super.showError('Failed to load radiation data');
    }
  }

  private render(): void {
    if (!this.data) return;
    
    this.loadingEl?.remove();
    
    const container = document.createElement('div');
    container.className = 'radiation-panel';

    // Alert level indicator
    const alert = document.createElement('div');
    alert.className = `radiation-alert ${this.data.alertLevel}`;
    alert.innerHTML = `
      <span class="alert-icon">${this.data.alertLevel === 'normal' ? '✅' : this.data.alertLevel === 'elevated' ? '⚠️' : '🚨'}</span>
      <span class="alert-text">${this.data.alertLevel.toUpperCase()}</span>
    `;
    container.appendChild(alert);

    // Sites grid
    const sites = document.createElement('div');
    sites.className = 'radiation-sites';
    this.data.sites.forEach(site => {
      const card = document.createElement('div');
      card.className = `site-card ${site.status}`;
      card.innerHTML = `
        <div class="site-name">${site.name}</div>
        <div class="site-value">${site.latestValue?.toFixed(1) || '--'} cpm</div>
        <div class="site-trend">${site.trend === 'stable' ? '➡️' : site.trend === 'rising' ? '📈' : '📉'}</div>
      `;
      sites.appendChild(card);
    });
    container.appendChild(sites);

    this.content.appendChild(container);
    this.setCount(this.data.sites.length);
  }
}
