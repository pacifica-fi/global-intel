export interface VerificationCheck {
  id: string;
  label: string;
  checked: boolean;
  icon: string;
}

export interface VerificationResult {
  score: number;  // 0-100
  checks: VerificationCheck[];
  verdict: 'verified' | 'likely' | 'uncertain' | 'unreliable';
  notes: string[];
}

const VERIFICATION_TEMPLATE: VerificationCheck[] = [
  { id: 'recency', label: 'Recent timestamp confirmed', checked: false, icon: '🕐' },
  { id: 'geolocation', label: 'Location verified', checked: false, icon: '📍' },
  { id: 'source', label: 'Primary source identified', checked: false, icon: '📰' },
  { id: 'crossref', label: 'Cross-referenced with other sources', checked: false, icon: '🔗' },
  { id: 'no_ai', label: 'No AI generation artifacts', checked: false, icon: '🤖' },
  { id: 'no_recrop', label: 'Not recycled/old footage', checked: false, icon: '🔄' },
  { id: 'metadata', label: 'Metadata verified', checked: false, icon: '📋' },
  { id: 'context', label: 'Context established', checked: false, icon: '📖' },
];

export class VerificationChecklist {
  private checks: VerificationCheck[] = VERIFICATION_TEMPLATE.map(c => ({ ...c }));
  private notes: string[] = [];
  private manualNote = '';

  private toggleCheck(id: string): void {
    this.checks = this.checks.map(c =>
      c.id === id ? { ...c, checked: !c.checked } : c
    );
  }

  private addNote(): void {
    if (this.manualNote.trim()) {
      this.notes = [...this.notes, this.manualNote.trim()];
      this.manualNote = '';
    }
  }

  private calculateResult(): VerificationResult {
    const checkedCount = this.checks.filter(c => c.checked).length;
    const score = Math.round((checkedCount / this.checks.length) * 100);

    let verdict: VerificationResult['verdict'];
    if (score >= 90) verdict = 'verified';
    else if (score >= 70) verdict = 'likely';
    else if (score >= 40) verdict = 'uncertain';
    else verdict = 'unreliable';

    return { score, checks: this.checks, verdict, notes: this.notes };
  }

  private reset(): void {
    this.checks = VERIFICATION_TEMPLATE.map(c => ({ ...c }));
    this.notes = [];
    this.manualNote = '';
  }

  public getResult(): VerificationResult {
    return this.calculateResult();
  }

  public setCheck(id: string, checked: boolean): void {
    const current = this.checks.find((c) => c.id === id);
    if (!current) return;
    if (current.checked !== checked) this.toggleCheck(id);
  }

  public addManualNote(note: string): void {
    this.manualNote = note;
    this.addNote();
  }

  public resetChecklist(): void {
    this.reset();
  }
}
