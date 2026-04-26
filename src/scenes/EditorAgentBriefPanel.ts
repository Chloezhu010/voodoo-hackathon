import type { AgentBriefOverlay } from '../ui/agentBriefOverlay.js';

// Thin shim — keeps EditorScene's existing API surface (drawSidebars / showModal)
// while the actual rendering lives in the DOM overlay.
export class EditorAgentBriefPanel {
  constructor(private readonly overlay: AgentBriefOverlay) {}

  drawSidebars(): void {
    this.overlay.update(window._editorAgentBriefReport);
  }

  showModal(): void {
    this.overlay.showModal();
  }
}
