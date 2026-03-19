import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { fetchSanctionsData, type SanctionsData, type SanctionedEntity } from '@/services/sanctions';

export class SanctionsPanel extends Panel {
  private data: SanctionsData | null = null;
  private loadingEl: HTMLElement | null = null;

  constructor() {
    super({
      id: 'sanctions',
      title: t('panels.sanctions'),
      showCount: true,
      trackActivity: true,
      infoTooltip: 'OFAC SDN + OpenSanctions aggregated tracking',
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
      this.data = await fetchSanctionsData();
      this.render();
    } catch (e) {
      console.error('Sanctions error:', e);
      this.showError();
    }
  }

  private render(): void {
    if (!this.data) return;
    
    this.loadingEl?.remove();
    
    const container = document.createElement('div');
    container.className = 'sanctions-panel';

    // Summary stats
    const stats = document.createElement('div');
    stats.className = 'sanctions-stats';
    stats.innerHTML = `
      <div class="stat">
        <span class="stat-value">${this.data.totalCount.toLocaleString()}</span>
        <span class="stat-label">Total Sanctioned</span>
      </div>
      <div class="stat">
        <span class="stat-value">${this.data.newThisWeek}</span>
        <span class="stat-label">New This Week</span>
      </div>
    `;
    container.appendChild(stats);

    // Program breakdown
    const programs = document.createElement('div');
    programs.className = 'sanctions-programs';
    const topPrograms = Object.entries(this.data.byProgram)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    topPrograms.forEach(([program, count]) => {
      const item = document.createElement('div');
      item.className = 'program-item';
      item.innerHTML = `<span class="program-name">${escapeHtml(program)}</span><span class="program-count">${count}</span>`;
      programs.appendChild(item);
    });
    container.appendChild(programs);

    // Recent entities
    const list = document.createElement('div');
    list.className = 'sanctions-list';
    this.data.entities.slice(0, 10).forEach(entity => {
      const item = document.createElement('div');
      item.className = 'sanction-item';
      item.innerHTML = `
        <span class="entity-name">${escapeHtml(entity.name)}</span>
        <span class="entity-type">${escapeHtml(entity.type)}</span>
      `;
      list.appendChild(item);
    });

    container.appendChild(list);
    this.content.appendChild(container);
    this.updateCount(this.data.totalCount);
  }

  private showError(): void {
    this.loadingEl?.remove();
    this.content.innerHTML = '<div class="panel-error">Failed to load sanctions data</div>';
  }
}
