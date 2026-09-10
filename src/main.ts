import { Plugin } from 'obsidian';
import { normalModeTab } from './tab';
import { getEditorView } from './adapter';
import { VimExtrasController } from './vim-extras';

export default class VimExtras extends Plugin {
	onload(): void {
		this.registerEditorExtension(normalModeTab);
		const extras = new VimExtrasController(this);
		this.register(() => extras.unload());
		extras.attachDocument(document);
		this.registerEvent(this.app.workspace.on('window-open', (_workspaceWindow, win) => {
			extras.attachDocument(win.document);
		}));
		// Include pop-out windows that were open before the plugin was enabled.
		for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
			extras.attachDocument(leaf.view.containerEl.ownerDocument);
		}
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
			const doc = getEditorView(this.app)?.dom.ownerDocument;
			if (doc) extras.attachDocument(doc);
		}));
	}
}
