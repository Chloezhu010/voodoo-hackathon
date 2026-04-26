import { UI } from '../config/constants.js';
import {
  analyzeLevelWithGemini,
  getGeminiApiKey,
  storeGeminiApiKey,
  type GeminiBriefReport,
} from '../services/geminiBrief.js';
import {
  AI_REVIEW_MODAL,
  EDITOR_LAYOUT,
  type AgentBriefView,
  type BriefCard,
  type BriefPill,
  type SidebarCard,
} from './editorLayout.js';

import type { EditorScene } from './EditorScene.js';

export class EditorAgentBriefPanel {
  constructor(private readonly scene: EditorScene) {}

  drawSidebars(): void {
    const report = window._editorAgentBriefReport;
    this._drawLeftSidebar(report);
    this._drawRightSidebar(report);
  }

  async showModal(): Promise<void> {
    const brief = this.scene.editorState.getAgentBrief();
    const modal = this.scene.makeModal('AI Review', AI_REVIEW_MODAL.width, AI_REVIEW_MODAL.height);
    const cachedReport = window._editorAgentBriefReport;
    const copyState = { text: cachedReport ? JSON.stringify(cachedReport, null, 2) : brief };
    const status = this.scene.add.text(0, -402, '', {
      fontSize: '20px',
      color: UI.MUTED_TEXT,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 760 },
    }).setOrigin(0.5);
    const body = this.scene.add.container(0, 0);
    const view: AgentBriefView = { body, copyState, localBrief: brief, status };
    modal.add([status, body]);
    if (cachedReport) this._renderReport(view, cachedReport, false);
    else this._renderReady(view);

    const runAnalysis = () => this._runAnalysis(view);
    this._addButtons(modal, view, runAnalysis);
    if (!cachedReport) await runAnalysis();
  }

  private _drawLeftSidebar(report: GeminiBriefReport | undefined): void {
    const panel = EDITOR_LAYOUT.briefLeft;
    const root = this.scene.root;
    root.add(this.scene.makePanel(panel.x, panel.y, panel.width, panel.height, UI.PANEL_LIGHT));
    root.add(this.scene.add.text(panel.x + panel.width / 2, panel.y + 26, 'AI REVIEW', {
      fontSize: '16px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));

    if (!report) {
      this._drawSidebarCard({
        x: panel.x + 14, y: panel.y + 70, width: panel.width - 28, height: 168,
        title: 'WAITING', body: 'Run AI Brief to pin the latest review here.', color: 0xeaf4ff, maxLines: 5,
      });
      this._drawSidebarCard({
        x: panel.x + 14, y: panel.y + 260, width: panel.width - 28, height: 180,
        title: 'ALWAYS VISIBLE', body: 'Generated results stay on the main editor beside the tools.', color: 0xf8fbff, maxLines: 5,
      });
      return;
    }

    const cards: SidebarCard[] = [
      {
        x: panel.x + 14, y: panel.y + 70, width: panel.width - 28, height: 92,
        title: 'VERDICT', body: report.verdict.toUpperCase(), color: this._verdictColor(report.verdict), maxLines: 1, inverted: true,
      },
      {
        x: panel.x + 14, y: panel.y + 174, width: panel.width - 28, height: 92,
        title: 'DIFFICULTY', body: `${report.difficultyScore}/10`, color: UI.PRIMARY_DARK, maxLines: 1, inverted: true,
      },
      {
        x: panel.x + 14, y: panel.y + 278, width: panel.width - 28, height: 92,
        title: 'CONFIDENCE', body: `${Math.round(report.confidence * 100)}%`, color: 0x2563eb, maxLines: 1, inverted: true,
      },
      {
        x: panel.x + 14, y: panel.y + 394, width: panel.width - 28, height: 116,
        title: 'SUMMARY', body: this._fitText(report.teamSummary, 88), color: 0xeaf4ff, maxLines: 3,
      },
    ];
    cards.forEach((card) => this._drawSidebarCard(card));
  }

  private _drawRightSidebar(report: GeminiBriefReport | undefined): void {
    const panel = EDITOR_LAYOUT.briefRight;
    const root = this.scene.root;
    root.add(this.scene.makePanel(panel.x, panel.y, panel.width, panel.height, UI.PANEL_LIGHT));
    root.add(this.scene.add.text(panel.x + panel.width / 2, panel.y + 26, 'AI ACTIONS', {
      fontSize: '16px', color: UI.DARK_TEXT, fontStyle: 'bold',
    }).setOrigin(0.5));

    if (!report) {
      this._drawSidebarCard({
        x: panel.x + 14, y: panel.y + 70, width: panel.width - 28, height: 168,
        title: 'NO REVIEW', body: 'AI risks and actions will appear here after analysis.', color: 0xfff4d8, maxLines: 5,
      });
      return;
    }

    this._drawSidebarCard({
      x: panel.x + 14, y: panel.y + 70, width: panel.width - 28, height: 144,
      title: 'STUCK POINTS', body: this._formatList(report.likelyStuckPoints, 'No clear stuck points.'), color: 0xfff4d8, maxLines: 4,
    });
    report.recommendedChanges.slice(0, 3).forEach((item, index) => {
      this._drawSidebarCard({
        x: panel.x + 14, y: panel.y + 232 + index * 92, width: panel.width - 28, height: 76,
        title: item.priority.toUpperCase(), body: this._fitText(item.change, 58), color: this._recommendationColor(item.priority), maxLines: 2,
      });
    });
  }

  private _drawSidebarCard(card: SidebarCard): void {
    const { x, y, width, height, title, body, color, maxLines } = card;
    const inverted = Boolean(card.inverted);
    const bg = this.scene.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(x, y, width, height, 14);
    bg.lineStyle(2, UI.BLUE_STROKE, inverted ? 0 : 0.18);
    bg.strokeRoundedRect(x, y, width, height, 14);
    const titleText = this.scene.add.text(x + 14, y + 18, title, {
      fontSize: '11px',
      color: inverted ? '#e8f2ff' : UI.MUTED_TEXT,
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const bodyText = this.scene.add.text(x + 14, y + 38, body, {
      fontSize: inverted ? '20px' : '13px',
      color: inverted ? '#ffffff' : UI.DARK_TEXT,
      fontStyle: 'bold',
      lineSpacing: 3,
      maxLines,
      wordWrap: { width: width - 28 },
    }).setOrigin(0, 0);
    this.scene.root.add([bg, titleText, bodyText]);
  }

  private _addButtons(
    modal: Phaser.GameObjects.Container,
    view: AgentBriefView,
    runAnalysis: () => Promise<void>,
  ): void {
    modal.add(this.scene.makeButton(-270, AI_REVIEW_MODAL.actionY, 150, 64, 'SET KEY', UI.PANEL_DARK, () => {
      const apiKey = window.prompt('Gemini API key');
      if (!apiKey) return;
      storeGeminiApiKey(apiKey);
      view.status.setText('Gemini key saved. Run review when ready.');
    }));
    modal.add(this.scene.makeButton(-90, AI_REVIEW_MODAL.actionY, 150, 64, 'RUN', UI.PRIMARY, () => {
      void runAnalysis();
    }));
    modal.add(this.scene.makeButton(90, AI_REVIEW_MODAL.actionY, 150, 64, 'COPY', UI.PANEL_DARK, async () => {
      try {
        await navigator.clipboard.writeText(view.copyState.text);
        this.scene.showToast('Copied AI brief');
      } catch {
        this.scene.showToast('Clipboard unavailable');
      }
    }));
    modal.add(this.scene.makeButton(270, AI_REVIEW_MODAL.actionY, 150, 64, 'CLOSE', UI.PANEL_DARK, () => this.scene.closeModal()));
  }

  private async _runAnalysis(view: AgentBriefView): Promise<void> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      this._renderMissingKey(view);
      return;
    }

    this._renderLoading(view);
    try {
      const report = await analyzeLevelWithGemini(
        this.scene.editorState.toLevelData(),
        this.scene.editorState.getValidationStatus(),
        view.localBrief,
        apiKey,
        {
          onDelta: (text) => {
            view.copyState.text = text;
            view.status.setText('Streaming structured review...');
          },
        },
      );
      view.copyState.text = JSON.stringify(report, null, 2);
      window._editorAgentBriefReport = report;
      this.scene.renderAll();
      this._renderReport(view, report, true);
    } catch (error) {
      this._renderError(view, (error as Error).message);
    }
  }

  private _renderReady(view: AgentBriefView): void {
    view.body.removeAll(true);
    view.status.setText('AI review turns the current level into actionable design feedback.');
    this._drawBriefCard(view.body, {
      x: 0, y: -122, width: AI_REVIEW_MODAL.contentWidth, height: 390,
      title: 'CURRENT LEVEL SNAPSHOT', body: this._fitText(view.localBrief, 980), color: 0xeaf4ff,
    });
    this._drawBriefCard(view.body, {
      x: 0, y: 246, width: AI_REVIEW_MODAL.contentWidth, height: 130,
      title: 'WHAT YOU GET',
      body: 'Verdict, difficulty, solvability risks, team-review findings, and prioritized tuning actions.',
      color: 0xf8fbff,
    });
  }

  private _renderMissingKey(view: AgentBriefView): void {
    view.body.removeAll(true);
    view.status.setText('Gemini key required. Set a key, then run the review.');
    this._drawBriefCard(view.body, {
      x: 0, y: -72, width: AI_REVIEW_MODAL.contentWidth, height: 300,
      title: 'AI REVIEW NEEDS A KEY',
      body: 'Use SET KEY to save a Gemini API key locally. You can still COPY the current level snapshot for manual review.',
      color: 0xfff4d8,
    });
    this._drawBriefCard(view.body, {
      x: 0, y: 212, width: AI_REVIEW_MODAL.contentWidth, height: 96,
      title: 'RECOVERY', body: 'After saving the key, press RUN. No level data is changed by this review.', color: 0xf8fbff,
    });
  }

  private _renderLoading(view: AgentBriefView): void {
    view.body.removeAll(true);
    view.status.setText('Analyzing level structure...');
    ['READABILITY', 'SOLVABILITY', 'TUNING ACTIONS'].forEach((label, index) => {
      this._drawBriefCard(view.body, {
        x: 0, y: -222 + index * 164, width: AI_REVIEW_MODAL.contentWidth, height: 136,
        title: label,
        body: 'Review in progress. Looking for stuck points and practical iteration steps...',
        color: index === 1 ? 0xeaf4ff : 0xf8fbff,
      });
    });
  }

  private _renderError(view: AgentBriefView, message: string): void {
    view.body.removeAll(true);
    view.status.setText('AI review failed. Fix the issue and run again.');
    this._drawBriefCard(view.body, {
      x: 0, y: -64, width: AI_REVIEW_MODAL.contentWidth, height: 320,
      title: 'REVIEW FAILED',
      body: this._fitText(`${message}\n\nCheck the API key or network state, then press RUN again.`, 760),
      color: 0xffe1e8,
    });
    this._drawBriefCard(view.body, {
      x: 0, y: 226, width: AI_REVIEW_MODAL.contentWidth, height: 72,
      title: 'FALLBACK', body: 'COPY still exports the local level snapshot.', color: 0xf8fbff,
    });
  }

  private _renderReport(view: AgentBriefView, report: GeminiBriefReport, animate: boolean): void {
    view.body.removeAll(true);
    view.status.setText('Structured AI review ready. This result is saved for quick reopening.');
    this._drawBriefPills(view.body, report);
    this._drawBriefCard(view.body, {
      x: -306,
      y: -126,
      width: 260,
      height: 276,
      title: 'SAVED RESULT',
      body: `Solvability: ${report.solvability.status.replace(/_/g, ' ')}\n${this._fitText(report.solvability.reason, 190)}`,
      color: 0xf8fbff,
      delay: 40,
      maxLines: 7,
    });
    this._drawBriefCard(view.body, {
      x: 142, y: -222, width: 552, height: 138, title: 'TEAM SUMMARY',
      body: this._fitText(report.teamSummary, 420), color: 0xeaf4ff, delay: 90, maxLines: 4,
    });
    this._drawBriefCard(view.body, {
      x: 142, y: -70, width: 552, height: 134, title: 'STUCK POINTS',
      body: this._formatList(report.likelyStuckPoints, 'No clear stuck points.'),
      color: report.likelyStuckPoints.length > 0 ? 0xfff4d8 : 0xecfdf3,
      delay: 150,
      maxLines: 4,
    });
    this._drawRecommendations(view.body, report.recommendedChanges);
    this._drawRoleReviews(view.body, report.roleReviews);
    if (animate) this._popIn(view.body);
  }

  private _drawBriefPills(container: Phaser.GameObjects.Container, report: GeminiBriefReport): void {
    const pills: BriefPill[] = [
      { x: -368, y: -314, width: 124, label: 'VERDICT', value: report.verdict.toUpperCase(), color: this._verdictColor(report.verdict) },
      { x: -242, y: -314, width: 124, label: 'PLACE', value: report.progressionPlacement.toUpperCase(), color: UI.PANEL_DARK },
      { x: -368, y: -238, width: 124, label: 'DIFF', value: `${report.difficultyScore}/10`, color: UI.PRIMARY_DARK },
      { x: -242, y: -238, width: 124, label: 'CONF', value: `${Math.round(report.confidence * 100)}%`, color: 0x2563eb },
    ];
    pills.forEach((pill) => this._drawBriefPill(container, pill));
  }

  private _drawBriefPill(container: Phaser.GameObjects.Container, pill: BriefPill): void {
    const bg = this.scene.add.graphics();
    bg.fillStyle(pill.color, 1);
    bg.fillRoundedRect(pill.x - pill.width / 2, pill.y - 34, pill.width, 68, 16);
    bg.lineStyle(2, 0xffffff, 0.2);
    bg.strokeRoundedRect(pill.x - pill.width / 2, pill.y - 34, pill.width, 68, 16);
    const label = this.scene.add.text(pill.x, pill.y - 12, pill.label, {
      fontSize: '12px', color: '#d8e9ff', fontStyle: 'bold',
    }).setOrigin(0.5);
    const value = this.scene.add.text(pill.x, pill.y + 13, pill.value, {
      fontSize: this._briefPillFontSize(pill.value), color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add([bg, label, value]);
  }

  private _drawBriefCard(container: Phaser.GameObjects.Container, card: BriefCard): void {
    const bg = this.scene.add.graphics();
    bg.fillStyle(card.color, 1);
    bg.fillRoundedRect(card.x - card.width / 2, card.y - card.height / 2, card.width, card.height, 18);
    bg.lineStyle(3, UI.BLUE_STROKE, 0.18);
    bg.strokeRoundedRect(card.x - card.width / 2, card.y - card.height / 2, card.width, card.height, 18);
    const title = this.scene.add.text(card.x - card.width / 2 + 26, card.y - card.height / 2 + 24, card.title, {
      fontSize: '16px', color: UI.MUTED_TEXT, fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const bodyStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: '18px',
      color: UI.DARK_TEXT,
      fontStyle: 'bold',
      lineSpacing: 6,
      wordWrap: { width: card.width - 52 },
    };
    if (card.maxLines !== undefined) bodyStyle.maxLines = card.maxLines;
    const body = this.scene.add.text(card.x - card.width / 2 + 26, card.y - card.height / 2 + 52, card.body, bodyStyle).setOrigin(0, 0);
    container.add([bg, title, body]);
    if (card.delay === undefined) return;
    const targets = [bg, title, body];
    targets.forEach((target) => target.setAlpha(0));
    this.scene.tweens.add({ targets, alpha: 1, duration: 180, delay: card.delay, ease: 'Sine.Out' });
  }

  private _drawRecommendations(container: Phaser.GameObjects.Container, recommendations: GeminiBriefReport['recommendedChanges']): void {
    const items = recommendations.slice(0, 3);
    if (items.length === 0) {
      this._drawBriefCard(container, {
        x: 142, y: 108, width: 552, height: 96, title: 'ACTIONS',
        body: 'No immediate tuning actions.', color: 0xecfdf3, delay: 210, maxLines: 1,
      });
      return;
    }

    items.forEach((item, index) => {
      this._drawBriefCard(container, {
        x: 142, y: 58 + index * 78, width: 552, height: 70,
        title: item.priority.toUpperCase(),
        body: this._fitText(`${item.change} - ${item.reason}`, 170),
        color: this._recommendationColor(item.priority),
        delay: 210 + index * 60,
        maxLines: 1,
      });
    });
  }

  private _drawRoleReviews(container: Phaser.GameObjects.Container, reviews: GeminiBriefReport['roleReviews']): void {
    const top = 292;
    const bg = this.scene.add.graphics();
    bg.fillStyle(0xf8fbff, 1);
    bg.fillRoundedRect(-134, top - 48, 552, 132, 18);
    bg.lineStyle(3, UI.BLUE_STROKE, 0.14);
    bg.strokeRoundedRect(-134, top - 48, 552, 132, 18);
    container.add(bg);
    container.add(this.scene.add.text(-104, top - 20, 'TEAM REVIEW', {
      fontSize: '16px', color: UI.MUTED_TEXT, fontStyle: 'bold',
    }).setOrigin(0, 0.5));

    reviews.slice(0, 4).forEach((review, index) => {
      const rowY = top + 12 + index * 24;
      const chip = this.scene.add.graphics();
      chip.fillStyle(this._severityColor(review.severity), 1);
      chip.fillRoundedRect(-104, rowY - 10, 104, 20, 8);
      const role = this.scene.add.text(-52, rowY, this._shortRoleLabel(review.role), {
        fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const finding = this.scene.add.text(12, rowY, this._fitText(review.finding, 104), {
        fontSize: '15px', color: UI.DARK_TEXT, fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      container.add([chip, role, finding]);
    });
  }

  private _formatList(items: string[], emptyText: string): string {
    if (items.length === 0) return emptyText;
    return items.slice(0, 4).map((item) => `- ${this._fitText(item, 180)}`).join('\n');
  }

  private _fitText(value: string, maxLength: number): string {
    const compact = value.replace(/\s+/g, ' ').trim();
    if (compact.length <= maxLength) return compact;
    return `${compact.slice(0, maxLength - 3)}...`;
  }

  private _briefPillFontSize(value: string): string {
    if (value.length > 9) return '16px';
    if (value.length > 6) return '18px';
    return '21px';
  }

  private _verdictColor(verdict: GeminiBriefReport['verdict']): number {
    return { ship: 0x059669, iterate: UI.ACCENT_DARK, cut: 0xdc2626 }[verdict];
  }

  private _recommendationColor(priority: GeminiBriefReport['recommendedChanges'][number]['priority']): number {
    return { must: 0xffe1e8, should: 0xfff4d8, could: 0xeaf4ff }[priority];
  }

  private _severityColor(severity: GeminiBriefReport['roleReviews'][number]['severity']): number {
    return { low: 0x2563eb, medium: UI.ACCENT_DARK, high: 0xdc2626 }[severity];
  }

  private _shortRoleLabel(role: GeminiBriefReport['roleReviews'][number]['role']): string {
    return {
      level_designer: 'DESIGN',
      gameplay_tester: 'TEST',
      product_manager: 'PM',
      balancing_critic: 'BALANCE',
      iteration_partner: 'ITERATE',
    }[role];
  }

  private _popIn(target: Phaser.GameObjects.Container): void {
    target.setAlpha(0);
    target.setScale(0.98);
    this.scene.tweens.add({ targets: target, alpha: 1, scale: 1, duration: 180, ease: 'Sine.Out' });
  }
}
