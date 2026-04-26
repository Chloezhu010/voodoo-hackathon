import {
  analyzeLevelWithGemini,
  getGeminiApiKey,
  storeGeminiApiKey,
  type GeminiBriefReport,
  type GeminiRecommendation,
  type GeminiRoleReview,
} from '../services/geminiBrief.js';
import type { EditorValidationStatus } from '../sim/editorState.js';
import type { LevelData } from '../sim/types.js';

import {
  BRIEF_TOKENS,
  PRIORITY_COLORS,
  SEVERITY_COLORS,
  VERDICT_COLORS,
} from './agentBriefTokens.js';

export interface EditorBriefContext {
  levelData: LevelData;
  validation: EditorValidationStatus;
  localBrief: string;
}

export interface AgentBriefOverlayCallbacks {
  getEditorContext: () => EditorBriefContext;
  onToast: (message: string) => void;
  onReportUpdate: () => void;
}

const ROOT_ID = 'editor-ai-overlay';
const STYLE_ID = 'editor-ai-overlay-style';

const SHORT_ROLE: Record<GeminiRoleReview['role'], string> = {
  level_designer: 'DESIGN',
  gameplay_tester: 'TEST',
  product_manager: 'PM',
  balancing_critic: 'BALANCE',
  iteration_partner: 'ITERATE',
};

type ReportRef = Window & { _editorAgentBriefReport?: GeminiBriefReport };

export class AgentBriefOverlay {
  private root: HTMLDivElement | null = null;
  private drawer: HTMLElement | null = null;
  private drawerBody: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private modalBody: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private runBtn: HTMLButtonElement | null = null;
  private busy = false;
  private collapsed = false;
  private keyFormOpen = false;
  private lastVerdict: string = 'none';

  private readonly onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.modal?.dataset.state === 'open') this.hideModal();
  };

  constructor(private readonly cb: AgentBriefOverlayCallbacks) {}

  mount(): void {
    if (this.root) return;
    this.injectStyle();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = `
      <aside class="ai-drawer" aria-label="AI level review" data-collapsed="false">
        <button class="ai-drawer__handle" aria-label="Toggle AI review drawer" aria-expanded="true">
          <span class="ai-drawer__dot" data-verdict="none"></span>
          <span class="ai-drawer__handle-text">AI Review</span>
          <span class="ai-drawer__chevron" aria-hidden="true">›</span>
        </button>
        <div class="ai-drawer__body"></div>
      </aside>
      <div class="ai-modal" role="dialog" aria-modal="true" aria-label="AI level review" data-state="closed">
        <div class="ai-modal__backdrop"></div>
        <div class="ai-modal__panel">
          <header class="ai-modal__header">
            <h2>AI Level Review</h2>
            <button class="ai-btn ai-btn--ghost ai-modal__close" aria-label="Close">×</button>
          </header>
          <p class="ai-modal__status" aria-live="polite"></p>
          <div class="ai-modal__body"></div>
          <footer class="ai-modal__footer">
            <button class="ai-btn ai-btn--ghost" data-action="set-key">Set API key</button>
            <button class="ai-btn ai-btn--primary" data-action="run">Run review</button>
            <button class="ai-btn ai-btn--ghost" data-action="copy">Copy JSON</button>
          </footer>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.drawer = root.querySelector('.ai-drawer');
    this.drawerBody = root.querySelector('.ai-drawer__body');
    this.modal = root.querySelector('.ai-modal');
    this.modalBody = root.querySelector('.ai-modal__body');
    this.statusEl = root.querySelector('.ai-modal__status');
    this.runBtn = root.querySelector('[data-action="run"]');

    root.querySelector('.ai-drawer__handle')?.addEventListener('click', () => this.toggleCollapsed());
    root.querySelector('.ai-modal__backdrop')?.addEventListener('click', () => this.hideModal());
    root.querySelector('.ai-modal__close')?.addEventListener('click', () => this.hideModal());
    root.querySelector('[data-action="set-key"]')?.addEventListener('click', () => this.openKeyForm());
    root.querySelector('[data-action="run"]')?.addEventListener('click', () => void this.handleRun());
    root.querySelector('[data-action="copy"]')?.addEventListener('click', () => void this.handleCopy());
    document.addEventListener('keydown', this.onKeydown);

    this.update(undefined);
  }

  unmount(): void {
    if (!this.root) return;
    document.removeEventListener('keydown', this.onKeydown);
    this.root.remove();
    this.root = null;
    this.drawer = this.drawerBody = this.modal = this.modalBody = this.statusEl = null;
    this.runBtn = null;
    document.getElementById(STYLE_ID)?.remove();
  }

  update(report: GeminiBriefReport | undefined): void {
    if (!this.root) return;
    this.renderDrawer(report);
    if (this.modal?.dataset.state === 'open') this.renderModalBody(report);
  }

  showModal(): void {
    if (!this.modal) return;
    this.modal.dataset.state = 'open';
    const report = (window as ReportRef)._editorAgentBriefReport;
    this.renderModalBody(report);
    if (!report && getGeminiApiKey()) void this.handleRun();
    else if (!report) this.setStatus('Set a Gemini API key, then run the review.');
    else this.setStatus('Cached review shown. Run again to refresh.');
  }

  hideModal(): void {
    if (this.modal) this.modal.dataset.state = 'closed';
  }

  // --- Drawer rendering ---------------------------------------------------

  private toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    if (!this.drawer) return;
    this.drawer.dataset.collapsed = String(this.collapsed);
    const handle = this.drawer.querySelector<HTMLElement>('.ai-drawer__handle');
    handle?.setAttribute('aria-expanded', String(!this.collapsed));
  }

  private renderDrawer(report: GeminiBriefReport | undefined): void {
    if (!this.drawer || !this.drawerBody) return;
    this.drawer.dataset.collapsed = String(this.collapsed);
    this.drawer.dataset.busy = String(this.busy);
    const dot = this.drawer.querySelector<HTMLElement>('.ai-drawer__dot');
    const nextVerdict = report?.verdict ?? 'none';
    if (dot) {
      dot.dataset.verdict = nextVerdict;
      // Pulse only on transition from none → result, not on every re-render.
      if (this.lastVerdict === 'none' && nextVerdict !== 'none') {
        dot.classList.remove('ai-drawer__dot--landed');
        // Force reflow so the animation restarts.
        void dot.offsetWidth;
        dot.classList.add('ai-drawer__dot--landed');
      }
    }
    this.lastVerdict = nextVerdict;
    this.drawerBody.innerHTML = report
      ? this.renderDrawerWithReport(report)
      : this.renderDrawerEmpty();
    this.bindDrawerActions(report);
  }

  private bindDrawerActions(report: GeminiBriefReport | undefined): void {
    if (!this.drawerBody) return;
    this.drawerBody.querySelector('[data-rail-action="open"]')?.addEventListener('click', () => this.showModal());
    this.drawerBody.querySelector('[data-rail-action="run"]')?.addEventListener('click', () => void this.handleRun());
    this.drawerBody.querySelector('[data-rail-action="key-toggle"]')?.addEventListener('click', () => {
      this.keyFormOpen = !this.keyFormOpen;
      this.renderDrawer(report);
      if (this.keyFormOpen) this.focusKeyInput();
    });
    this.drawerBody.querySelector('[data-rail-action="key-save"]')?.addEventListener('click', () => this.saveKeyFromForm());
    this.drawerBody.querySelector('.ai-key-form input')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') this.saveKeyFromForm();
    });
  }

  private renderDrawerHeader(report: GeminiBriefReport | undefined): string {
    const runLabel = this.busy ? 'Running…' : report ? 'Re-run' : 'Run review';
    const busyAttr = this.busy ? 'aria-busy="true" disabled' : '';
    const spinner = this.busy ? '<span class="ai-spinner" aria-hidden="true"></span>' : '';
    return `
      <header class="ai-drawer__head">
        <div class="ai-drawer__actions">
          <button class="ai-btn ai-btn--ghost ai-btn--sm" data-rail-action="run" ${busyAttr}>${spinner}${runLabel}</button>
          ${report ? '<button class="ai-btn ai-btn--primary ai-btn--sm" data-rail-action="open">Open full</button>' : ''}
        </div>
      </header>
    `;
  }

  private renderDrawerEmpty(): string {
    const hasKey = Boolean(getGeminiApiKey());
    return `
      ${this.renderDrawerHeader(undefined)}
      <div class="ai-empty">
        <p><strong>${hasKey ? 'No review yet.' : 'Add a Gemini API key.'}</strong></p>
        <p>${hasKey ? 'Run a review to see verdict, stuck points, and tuning actions here.' : 'Paste your key once; it stays in browser localStorage.'}</p>
      </div>
      ${this.renderKeyForm()}
      ${this.renderSnapshotDetails()}
    `;
  }

  private renderDrawerWithReport(report: GeminiBriefReport): string {
    return `
      ${this.renderDrawerHeader(report)}
      ${this.renderChips(report, 'rail')}
      ${this.renderSection('Team summary', `<p class="ai-body">${escapeHtml(report.teamSummary)}</p>`)}
      ${this.renderStuckPoints(report.likelyStuckPoints)}
      ${this.renderRecommendations(report.recommendedChanges)}
      ${this.renderRoleReviews(report.roleReviews)}
      ${this.renderKeyForm()}
      ${this.renderSnapshotDetails()}
    `;
  }

  private renderKeyForm(): string {
    const hasKey = Boolean(getGeminiApiKey());
    if (!this.keyFormOpen) {
      return `
        <button class="ai-mini-link" data-rail-action="key-toggle">${hasKey ? 'Change API key' : 'Set API key'}</button>
      `;
    }
    return `
      <div class="ai-key-form">
        <label class="ai-key-form__label">Gemini API key (stored locally)</label>
        <div class="ai-key-form__row">
          <input type="password" placeholder="Paste key" autocomplete="off" spellcheck="false" />
          <button class="ai-btn ai-btn--primary ai-btn--sm" data-rail-action="key-save">Save</button>
          <button class="ai-btn ai-btn--ghost ai-btn--sm" data-rail-action="key-toggle">Cancel</button>
        </div>
      </div>
    `;
  }

  private renderSnapshotDetails(): string {
    const { localBrief } = this.cb.getEditorContext();
    return `
      <details class="ai-snapshot-details">
        <summary>Payload sent to AI</summary>
        <pre class="ai-snapshot">${escapeHtml(localBrief)}</pre>
      </details>
    `;
  }

  private focusKeyInput(): void {
    setTimeout(() => {
      this.drawerBody?.querySelector<HTMLInputElement>('.ai-key-form input')?.focus();
    }, 80);
  }

  private saveKeyFromForm(): void {
    const input = this.drawerBody?.querySelector<HTMLInputElement>('.ai-key-form input');
    if (!input) return;
    const value = input.value.trim();
    if (!value) {
      this.cb.onToast('Key is empty');
      return;
    }
    storeGeminiApiKey(value);
    this.keyFormOpen = false;
    this.cb.onToast('Gemini key saved');
    this.setStatus('Key saved. Run review when ready.');
    this.update((window as ReportRef)._editorAgentBriefReport);
  }

  private openKeyForm(): void {
    // Modal-side button: ensure drawer is expanded and form visible.
    this.keyFormOpen = true;
    this.collapsed = false;
    this.update((window as ReportRef)._editorAgentBriefReport);
    this.focusKeyInput();
  }

  // --- Modal rendering ----------------------------------------------------

  private renderModalBody(report: GeminiBriefReport | undefined): void {
    if (!this.modalBody) return;
    if (!report) {
      const hasKey = Boolean(getGeminiApiKey());
      this.modalBody.innerHTML = `
        <div class="ai-empty ai-empty--lg">
          <h3>${hasKey ? 'Run the review to see findings here.' : 'Add a Gemini API key to start.'}</h3>
          <p>${hasKey ? 'Verdict, stuck points, role reviews, and prioritized tuning actions appear here once a review runs.' : 'Use Set API key in the side drawer or footer below, then run a review.'}</p>
        </div>
      `;
      return;
    }
    this.modalBody.innerHTML = `
      ${this.renderChips(report, 'modal')}
      ${this.renderSection('Team summary', `<p class="ai-body ai-body--lg">${escapeHtml(report.teamSummary)}</p>`)}
      ${this.renderSection('Solvability', `<p class="ai-body"><strong>${escapeHtml(report.solvability.status.replace(/_/g, ' '))}</strong> — ${escapeHtml(report.solvability.reason)}</p>`)}
      ${this.renderStuckPoints(report.likelyStuckPoints)}
      ${this.renderRecommendations(report.recommendedChanges, true)}
      ${this.renderRoleReviews(report.roleReviews, true)}
    `;
  }

  // --- Shared sections ---------------------------------------------------

  private renderChips(report: GeminiBriefReport, kind: 'rail' | 'modal'): string {
    const verdictColor = VERDICT_COLORS[report.verdict];
    const cls = kind === 'modal' ? 'ai-chips ai-chips--lg' : 'ai-chips';
    return `
      <div class="${cls}">
        <div class="ai-chip ai-chip--verdict" style="--chip-color:${verdictColor}">
          <span class="ai-chip__label">Verdict</span>
          <span class="ai-chip__value">${escapeHtml(report.verdict.toUpperCase())}</span>
        </div>
        <div class="ai-chip ai-chip--neutral">
          <span class="ai-chip__label">Difficulty</span>
          <span class="ai-chip__value">${report.difficultyScore}<span class="ai-chip__unit">/10</span></span>
        </div>
        <div class="ai-chip ai-chip--neutral">
          <span class="ai-chip__label">Confidence</span>
          <span class="ai-chip__value">${Math.round(report.confidence * 100)}<span class="ai-chip__unit">%</span></span>
        </div>
        <div class="ai-chip ai-chip--neutral">
          <span class="ai-chip__label">Place</span>
          <span class="ai-chip__value ai-chip__value--text">${escapeHtml(report.progressionPlacement.toUpperCase())}</span>
        </div>
      </div>
    `;
  }

  private renderStuckPoints(points: string[]): string {
    if (points.length === 0) {
      return this.renderSection('Stuck points', '<p class="ai-body ai-body--ok">No clear stuck points detected.</p>');
    }
    const items = points.map((p) => `<li>${escapeHtml(p)}</li>`).join('');
    return this.renderSection('Stuck points', `<ul class="ai-list">${items}</ul>`);
  }

  private renderRecommendations(items: GeminiRecommendation[], full = false): string {
    if (items.length === 0) {
      return this.renderSection('Recommended changes', '<p class="ai-body ai-body--ok">No tuning actions needed.</p>');
    }
    const cards = items.map((item, idx) => {
      const color = PRIORITY_COLORS[item.priority];
      const reason = full ? `<p class="ai-rec__reason">${escapeHtml(item.reason)}</p>` : '';
      return `
        <div class="ai-rec" style="--rec-color:${color};--rec-delay:${idx * 30}ms">
          <span class="ai-rec__priority">${escapeHtml(item.priority.toUpperCase())}</span>
          <p class="ai-rec__change">${escapeHtml(item.change)}</p>
          ${reason}
        </div>
      `;
    }).join('');
    return this.renderSection('Recommended changes', cards);
  }

  private renderRoleReviews(reviews: GeminiRoleReview[], full = false): string {
    if (reviews.length === 0) return '';
    const rows = reviews.slice(0, full ? reviews.length : 5).map((r) => {
      const color = SEVERITY_COLORS[r.severity];
      return `
        <div class="ai-role">
          <span class="ai-role__chip" style="background:${color}">${escapeHtml(SHORT_ROLE[r.role])}</span>
          <p class="ai-role__finding">${escapeHtml(r.finding)}</p>
        </div>
      `;
    }).join('');
    return this.renderSection('Team review', rows);
  }

  private renderSection(title: string, body: string): string {
    return `<section class="ai-section"><h3 class="ai-section__title">${title}</h3>${body}</section>`;
  }

  // --- Actions ------------------------------------------------------------

  private async handleRun(): Promise<void> {
    if (this.busy) return;
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      this.setStatus('Set a Gemini API key first.');
      this.openKeyForm();
      return;
    }
    this.busy = true;
    if (this.runBtn) {
      this.runBtn.disabled = true;
      this.runBtn.setAttribute('aria-busy', 'true');
    }
    this.renderDrawer((window as ReportRef)._editorAgentBriefReport);
    this.setStatus('Analyzing level — streaming structured review…');
    try {
      const ctx = this.cb.getEditorContext();
      const report = await analyzeLevelWithGemini(ctx.levelData, ctx.validation, ctx.localBrief, apiKey, {
        onDelta: () => this.setStatus('Streaming structured review…'),
      });
      (window as ReportRef)._editorAgentBriefReport = report;
      this.setStatus('Review ready. Cached for this session.');
      this.cb.onReportUpdate();
    } catch (error) {
      this.setStatus(`Review failed: ${(error as Error).message}`);
    } finally {
      this.busy = false;
      if (this.runBtn) {
        this.runBtn.disabled = false;
        this.runBtn.removeAttribute('aria-busy');
      }
      this.renderDrawer((window as ReportRef)._editorAgentBriefReport);
    }
  }

  private async handleCopy(): Promise<void> {
    const report = (window as ReportRef)._editorAgentBriefReport;
    const text = report ? JSON.stringify(report, null, 2) : this.cb.getEditorContext().localBrief;
    try {
      await navigator.clipboard.writeText(text);
      this.cb.onToast('Copied AI brief');
    } catch {
      this.cb.onToast('Clipboard unavailable');
    }
  }

  private setStatus(text: string): void {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = OVERLAY_CSS;
    document.head.appendChild(style);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const T = BRIEF_TOKENS;
// Motion tokens — keep in sync across drawer/modal/list to give one rhythm.
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const DUR_FAST = '140ms';
const DUR_BASE = '200ms';
const DUR_ENTER = '220ms';
const DUR_EXIT = '150ms';
const OVERLAY_CSS = `
#${ROOT_ID} {
  position: fixed; inset: 0; pointer-events: none; z-index: 50;
  font-family: ${T.fontBody};
  color: ${T.textStrong};
}
#${ROOT_ID} .ai-drawer {
  position: fixed; top: 24px; right: 24px; bottom: 24px; width: 340px;
  background: ${T.surface}; border: 1px solid ${T.border}; border-radius: 16px;
  box-shadow: ${T.shadow};
  pointer-events: auto;
  display: flex; flex-direction: column;
  transition: width 240ms ${EASE};
  overflow: hidden;
}
#${ROOT_ID} .ai-drawer[data-collapsed="true"] { width: 52px; }
#${ROOT_ID} .ai-drawer__body {
  padding: 14px 16px 18px; flex: 1;
  overflow-y: auto; overflow-x: hidden;
  display: flex; flex-direction: column; gap: 12px;
  opacity: 1;
  transition: opacity 200ms ${EASE};
}
#${ROOT_ID} .ai-drawer[data-collapsed="true"] .ai-drawer__body {
  opacity: 0; pointer-events: none;
  transition: opacity 140ms ${EASE};
}
#${ROOT_ID} .ai-drawer__handle {
  appearance: none; border: none; cursor: pointer; background: transparent;
  color: ${T.textStrong};
  font-family: ${T.fontDisplay};
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; font-weight: 600; font-size: 13px;
  letter-spacing: 0.08em;
  border-bottom: 1px solid ${T.border};
  transition: background ${DUR_FAST} ease;
}
#${ROOT_ID} .ai-drawer__handle:hover { background: ${T.surfaceMuted}; }
#${ROOT_ID} .ai-drawer__handle:focus-visible {
  outline: 2px solid ${T.primary}; outline-offset: -2px;
}
#${ROOT_ID} .ai-drawer[data-collapsed="true"] .ai-drawer__handle {
  flex-direction: column; padding: 14px 0; border-bottom: none;
  height: 100%; justify-content: flex-start; gap: 14px;
}
#${ROOT_ID} .ai-drawer[data-collapsed="true"] .ai-drawer__handle-text {
  writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: 0.18em;
}
#${ROOT_ID} .ai-drawer__dot {
  width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto;
  background: transparent;
  border: 1.5px dashed ${T.borderStrong};
  box-shadow: 0 0 0 3px rgba(255,255,255,0.6);
  transition: background ${DUR_BASE} ease, border-color ${DUR_BASE} ease, transform ${DUR_BASE} ${EASE};
}
#${ROOT_ID} .ai-drawer__dot[data-verdict="ship"] { background: ${VERDICT_COLORS.ship}; border: 1.5px solid ${VERDICT_COLORS.ship}; }
#${ROOT_ID} .ai-drawer__dot[data-verdict="iterate"] { background: ${VERDICT_COLORS.iterate}; border: 1.5px solid ${VERDICT_COLORS.iterate}; }
#${ROOT_ID} .ai-drawer__dot[data-verdict="cut"] { background: ${VERDICT_COLORS.cut}; border: 1.5px solid ${VERDICT_COLORS.cut}; }
#${ROOT_ID} .ai-drawer__dot--landed { animation: aiDotLand 320ms ${EASE}; }
#${ROOT_ID} .ai-drawer[data-busy="true"] .ai-drawer__dot {
  animation: aiDotPulse 1.4s ease-in-out infinite;
}
@keyframes aiDotLand {
  0% { transform: scale(1); }
  45% { transform: scale(1.35); }
  100% { transform: scale(1); }
}
@keyframes aiDotPulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(255,255,255,0.6), 0 0 0 0 rgba(123, 53, 188, 0.35); }
  50% { box-shadow: 0 0 0 3px rgba(255,255,255,0.6), 0 0 0 6px rgba(123, 53, 188, 0); }
}
#${ROOT_ID} .ai-drawer__chevron {
  margin-left: auto; font-size: 18px; color: ${T.textMuted};
  transition: transform ${DUR_BASE} ${EASE};
  transform: rotate(90deg);
}
#${ROOT_ID} .ai-drawer[data-collapsed="true"] .ai-drawer__chevron { transform: rotate(-90deg); }
#${ROOT_ID} .ai-drawer__head {
  display: flex; align-items: center; justify-content: flex-end;
}
#${ROOT_ID} .ai-drawer__actions { display: flex; gap: 6px; flex-wrap: wrap; }
#${ROOT_ID} .ai-snapshot-details {
  margin-top: 4px; padding: 8px 10px;
  background: ${T.surfaceMuted}; border-radius: 10px;
  font-size: 12px; color: ${T.textMuted};
}
#${ROOT_ID} .ai-snapshot-details summary {
  cursor: pointer; font-weight: 600; user-select: none;
  letter-spacing: 0; padding: 2px 0;
}
#${ROOT_ID} .ai-snapshot-details[open] summary { margin-bottom: 8px; }
#${ROOT_ID} .ai-snapshot {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px; line-height: 1.5; color: ${T.textStrong};
  background: white; border: 1px solid ${T.border};
  border-radius: 8px; padding: 10px; margin: 0;
  white-space: pre-wrap; word-break: break-word;
  max-height: 220px; overflow: auto;
}
#${ROOT_ID} .ai-key-form {
  background: ${T.surfaceMuted}; border-radius: 10px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
}
#${ROOT_ID} .ai-key-form__label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: ${T.textMuted};
  font-family: ${T.fontDisplay};
}
#${ROOT_ID} .ai-key-form__row { display: flex; gap: 6px; flex-wrap: wrap; }
#${ROOT_ID} .ai-key-form input {
  flex: 1 1 140px; min-width: 0; padding: 8px 10px;
  border: 1px solid ${T.border}; border-radius: 8px;
  font-family: inherit; font-size: 13px; background: white;
  color: ${T.textStrong};
  transition: border-color ${DUR_FAST} ease, box-shadow ${DUR_FAST} ease;
}
#${ROOT_ID} .ai-key-form input:focus {
  outline: none;
  border-color: ${T.primary};
  box-shadow: 0 0 0 3px rgba(123, 53, 188, 0.18);
}
#${ROOT_ID} .ai-mini-link {
  appearance: none; border: none; background: transparent;
  cursor: pointer; padding: 4px 0; align-self: flex-start;
  color: ${T.primary}; font-family: inherit; font-size: 12px; font-weight: 600;
  text-decoration: underline; text-underline-offset: 2px;
  transition: color ${DUR_FAST} ease;
}
#${ROOT_ID} .ai-mini-link:hover { color: ${T.primaryHover}; }
#${ROOT_ID} .ai-section { display: flex; flex-direction: column; gap: 8px; }
#${ROOT_ID} .ai-section__title {
  margin: 0; font-size: 11px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase; color: ${T.textMuted};
  font-family: ${T.fontDisplay};
}
#${ROOT_ID} .ai-body { margin: 0; font-size: 14px; line-height: 1.55; color: ${T.textStrong}; }
#${ROOT_ID} .ai-body--lg { font-size: 16px; line-height: 1.6; }
#${ROOT_ID} .ai-body--ok { color: ${T.textOk}; }
#${ROOT_ID} .ai-list {
  margin: 0; padding-left: 18px; font-size: 14px; line-height: 1.55; color: ${T.textStrong};
  display: flex; flex-direction: column; gap: 6px;
}
#${ROOT_ID} .ai-chips { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
#${ROOT_ID} .ai-chips--lg { grid-template-columns: repeat(4, 1fr); gap: 12px; }
#${ROOT_ID} .ai-chip {
  position: relative;
  border-radius: 12px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 4px;
  background: white;
  border: 1px solid ${T.border};
  box-shadow: 0 4px 12px -10px rgba(36, 64, 111, 0.35);
  transition: transform ${DUR_FAST} ease, box-shadow ${DUR_FAST} ease;
  font-family: ${T.fontDisplay};
}
#${ROOT_ID} .ai-chip:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px -10px rgba(36, 64, 111, 0.5);
}
#${ROOT_ID} .ai-chip--verdict {
  background: var(--chip-color);
  border-color: transparent;
  color: white;
}
#${ROOT_ID} .ai-chip--verdict::before {
  content: ""; position: absolute; inset: 0; border-radius: 12px;
  background: linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0));
  pointer-events: none;
}
#${ROOT_ID} .ai-chip--neutral { color: ${T.textStrong}; }
#${ROOT_ID} .ai-chip__label {
  font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
  font-weight: 600;
  color: ${T.textFaint};
}
#${ROOT_ID} .ai-chip--verdict .ai-chip__label { color: rgba(255, 255, 255, 0.82); }
#${ROOT_ID} .ai-chip__value {
  font-size: 22px; font-weight: 700; line-height: 1.05;
  font-variant-numeric: tabular-nums;
}
#${ROOT_ID} .ai-chip__value--text { font-size: 16px; letter-spacing: 0.04em; }
#${ROOT_ID} .ai-chip__unit {
  font-size: 13px; font-weight: 500; color: ${T.textFaint};
  margin-left: 1px; letter-spacing: 0;
}
#${ROOT_ID} .ai-chip--verdict .ai-chip__unit { color: rgba(255,255,255,0.7); }
#${ROOT_ID} .ai-chips--lg .ai-chip { padding: 14px 16px; }
#${ROOT_ID} .ai-chips--lg .ai-chip__value { font-size: 26px; }
#${ROOT_ID} .ai-chips--lg .ai-chip__value--text { font-size: 18px; }
#${ROOT_ID} .ai-rec {
  border-radius: 10px; padding: 10px 12px 10px 14px;
  background: color-mix(in srgb, var(--rec-color) 8%, white);
  border: 1px solid color-mix(in srgb, var(--rec-color) 22%, transparent);
  border-left: 4px solid var(--rec-color, ${T.primary});
  display: flex; flex-direction: column; gap: 4px;
  margin-bottom: 8px;
  opacity: 0; transform: translateY(4px);
  animation: aiRecIn 260ms ${EASE} forwards;
  animation-delay: var(--rec-delay, 0ms);
}
#${ROOT_ID} .ai-rec:last-child { margin-bottom: 0; }
@keyframes aiRecIn {
  to { opacity: 1; transform: translateY(0); }
}
#${ROOT_ID} .ai-rec__priority {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--rec-color);
  font-family: ${T.fontDisplay};
}
#${ROOT_ID} .ai-rec__change { margin: 0; font-size: 14px; line-height: 1.5; color: ${T.textStrong}; font-weight: 600; }
#${ROOT_ID} .ai-rec__reason { margin: 0; font-size: 13px; line-height: 1.55; color: ${T.textMuted}; }
#${ROOT_ID} .ai-role {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 8px 0; border-bottom: 1px solid ${T.border};
}
#${ROOT_ID} .ai-role:last-child { border-bottom: none; }
#${ROOT_ID} .ai-role__chip {
  flex: 0 0 auto; padding: 4px 8px; border-radius: 6px;
  color: white; font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  font-family: ${T.fontDisplay};
}
#${ROOT_ID} .ai-role__finding { margin: 0; font-size: 13px; line-height: 1.5; color: ${T.textStrong}; }
#${ROOT_ID} .ai-empty {
  background: ${T.surfaceMuted}; border-radius: 12px; padding: 14px;
  font-size: 13px; line-height: 1.55; color: ${T.textStrong};
  display: flex; flex-direction: column; gap: 6px;
}
#${ROOT_ID} .ai-empty p { margin: 0; }
#${ROOT_ID} .ai-empty--lg { padding: 20px; gap: 12px; }
#${ROOT_ID} .ai-empty--lg h3 { margin: 0; font-size: 18px; font-family: ${T.fontDisplay}; font-weight: 700; }
#${ROOT_ID} .ai-btn {
  appearance: none; border: none; cursor: pointer;
  font-family: ${T.fontDisplay}; font-size: 13px; font-weight: 600;
  padding: 10px 14px; border-radius: 10px; line-height: 1.2;
  letter-spacing: 0;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  transition: background ${DUR_FAST} ease, color ${DUR_FAST} ease, transform ${DUR_FAST} ease, box-shadow ${DUR_FAST} ease;
}
#${ROOT_ID} .ai-btn:active:not(:disabled) { transform: scale(0.97); }
#${ROOT_ID} .ai-btn--sm { padding: 6px 10px; font-size: 12px; border-radius: 8px; }
#${ROOT_ID} .ai-btn:disabled { opacity: 0.55; cursor: progress; }
#${ROOT_ID} .ai-btn:focus-visible { outline: 2px solid ${T.primary}; outline-offset: 2px; }
#${ROOT_ID} .ai-btn--primary { background: ${T.primary}; color: ${T.textOnPrimary}; }
#${ROOT_ID} .ai-btn--primary:hover:not(:disabled) { background: ${T.primaryHover}; }
#${ROOT_ID} .ai-btn--ghost { background: ${T.surfaceMuted}; color: ${T.textStrong}; }
#${ROOT_ID} .ai-btn--ghost:hover:not(:disabled) { background: #dde9f8; }
#${ROOT_ID} .ai-spinner {
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid currentColor; border-right-color: transparent;
  animation: aiSpin 0.8s linear infinite;
  display: inline-block; flex: 0 0 auto;
  opacity: 0.85;
}
@keyframes aiSpin { to { transform: rotate(360deg); } }
#${ROOT_ID} .ai-modal {
  position: fixed; inset: 0; pointer-events: none;
  display: grid; place-items: center;
}
#${ROOT_ID} .ai-modal[data-state="open"] { pointer-events: auto; }
#${ROOT_ID} .ai-modal__backdrop {
  position: absolute; inset: 0;
  background: rgba(20, 30, 60, 0.55);
  backdrop-filter: blur(4px);
  opacity: 0;
  transition: opacity ${DUR_EXIT} ease;
}
#${ROOT_ID} .ai-modal[data-state="open"] .ai-modal__backdrop {
  opacity: 1;
  transition: opacity ${DUR_ENTER} ease;
}
#${ROOT_ID} .ai-modal__panel {
  position: relative;
  width: min(960px, calc(100vw - 48px));
  max-height: min(86vh, 880px);
  background: white; border-radius: 18px;
  box-shadow: 0 32px 64px -32px rgba(20, 30, 60, 0.55);
  display: grid; grid-template-rows: auto auto 1fr auto;
  opacity: 0; transform: translateY(8px) scale(0.98);
  transition: opacity ${DUR_EXIT} ${EASE}, transform ${DUR_EXIT} ${EASE};
  overflow: hidden;
}
#${ROOT_ID} .ai-modal[data-state="open"] .ai-modal__panel {
  opacity: 1; transform: translateY(0) scale(1);
  transition: opacity ${DUR_ENTER} ${EASE}, transform ${DUR_ENTER} ${EASE};
}
#${ROOT_ID} .ai-modal__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px; border-bottom: 1px solid ${T.border};
}
#${ROOT_ID} .ai-modal__header h2 {
  margin: 0; font-size: 20px; color: ${T.textStrong};
  font-family: ${T.fontDisplay}; font-weight: 700;
}
#${ROOT_ID} .ai-modal__close { font-size: 22px; padding: 4px 12px; }
#${ROOT_ID} .ai-modal__status {
  margin: 0; padding: 12px 24px; font-size: 13px; color: ${T.textMuted};
  background: ${T.surfaceMuted}; border-bottom: 1px solid ${T.border};
}
#${ROOT_ID} .ai-modal__body {
  padding: 20px 24px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 18px;
}
#${ROOT_ID} .ai-modal__footer {
  display: flex; gap: 10px; justify-content: flex-end;
  padding: 16px 24px; border-top: 1px solid ${T.border};
  background: ${T.surface};
}
@media (max-width: 1024px) {
  #${ROOT_ID} .ai-drawer { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  #${ROOT_ID} *,
  #${ROOT_ID} *::before,
  #${ROOT_ID} *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }
  #${ROOT_ID} .ai-rec { opacity: 1; transform: none; }
}
`;
