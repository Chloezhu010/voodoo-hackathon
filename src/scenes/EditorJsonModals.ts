import { UI } from '../config/constants.js';

import { type ActiveTextInput } from './editorLayout.js';
import type { EditorScene } from './EditorScene.js';

export class EditorJsonModals {
  constructor(private readonly scene: EditorScene) {}

  showExport(): void {
    const json = this.scene.editorState.exportJSON();
    const modal = this.scene.makeModal('Exported JSON');
    const display = json.length > 2600 ? `${json.slice(0, 2600)}\n...` : json;
    const outputBg = this.scene.add.rectangle(0, -40, 540, 520, 0x151522, 1);
    outputBg.setStrokeStyle(2, 0xffffff, 0.14);
    modal.add(outputBg);
    modal.add(this.scene.add.text(-270, -275, display, {
      fontSize: '13px',
      color: '#a0ffa0',
      fontStyle: 'bold',
      wordWrap: { width: 540 },
    }).setOrigin(0, 0));

    modal.add(this.scene.makeButton(-115, 336, 190, 58, 'COPY', UI.PRIMARY, async () => {
      try {
        await navigator.clipboard.writeText(json);
        this.scene.showToast('Copied JSON');
      } catch {
        this.scene.showToast('Clipboard unavailable');
      }
    }));
    modal.add(this.scene.makeButton(115, 336, 190, 58, 'CLOSE', UI.PANEL_DARK, () => this.scene.closeModal()));
  }

  showImport(): void {
    const modal = this.scene.makeModal('Import JSON');
    const inputBg = this.scene.add.rectangle(0, -40, 540, 520, 0x151522, 1);
    inputBg.setStrokeStyle(2, 0xffffff, 0.14);
    modal.add(inputBg);

    const inputText = this.scene.add.text(-255, -285, 'Paste or type JSON here', {
      fontSize: '13px',
      color: '#8f8fa8',
      fontStyle: 'bold',
      wordWrap: { width: 510 },
    }).setOrigin(0, 0);
    modal.add(inputText);

    const errorText = this.scene.add.text(0, 244, '', {
      fontSize: '15px',
      color: '#ff9a9a',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 520 },
    }).setOrigin(0.5);
    modal.add(errorText);

    this.scene.activeTextInput = { value: '', text: inputText, errorText };
    inputBg.setInteractive({ useHandCursor: true });
    inputBg.on('pointerdown', () => {
      this.scene.activeTextInput = this._input(inputText, errorText);
      this.scene.refreshInputText();
    });

    modal.add(this.scene.makeButton(-205, 336, 150, 58, 'PASTE', UI.PANEL_DARK, async () => {
      await this._paste(errorText);
    }));
    modal.add(this.scene.makeButton(0, 336, 150, 58, 'LOAD', UI.PRIMARY, () => {
      this._load(errorText);
    }));
    modal.add(this.scene.makeButton(205, 336, 150, 58, 'CLOSE', UI.PANEL_DARK, () => this.scene.closeModal()));
  }

  showConfirmClear(): void {
    const modal = this.scene.makeModal('Clear All?');
    modal.add(this.scene.add.text(0, -40, 'Remove all blocks from the editor?', {
      fontSize: '24px',
      color: UI.DARK_TEXT,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 480 },
    }).setOrigin(0.5));
    modal.add(this.scene.makeButton(-120, 125, 190, 62, 'CLEAR', 0x923653, () => {
      this.scene.editorState.clear();
      this.scene.persistState();
      this.scene.closeModal();
      this.scene.renderAll();
    }));
    modal.add(this.scene.makeButton(120, 125, 190, 62, 'CANCEL', UI.PANEL_DARK, () => this.scene.closeModal()));
  }

  private _input(text: Phaser.GameObjects.Text, errorText: Phaser.GameObjects.Text): ActiveTextInput {
    return { value: this.scene.activeTextInput?.value ?? '', text, errorText };
  }

  private async _paste(errorText: Phaser.GameObjects.Text): Promise<void> {
    try {
      if (!this.scene.activeTextInput) return;
      this.scene.activeTextInput.value = await navigator.clipboard.readText();
      this.scene.refreshInputText();
    } catch {
      errorText.setText('Clipboard read failed.');
    }
  }

  private _load(errorText: Phaser.GameObjects.Text): void {
    try {
      if (!this.scene.activeTextInput) return;
      this.scene.editorState.importJSON(this.scene.activeTextInput.value);
      this.scene.persistState();
      this.scene.closeModal();
      this.scene.renderAll();
      this.scene.showToast('Imported JSON');
    } catch (error) {
      errorText.setText((error as Error).message);
    }
  }
}
