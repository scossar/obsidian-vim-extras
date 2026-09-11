import { Plugin } from 'obsidian';
import { normalModeTab } from './tab';
import { toggleHeadingFold } from './folding';
import { getEditorView } from './adapter';
import { VimExtrasController } from './vim-extras';
import { registerPaneCommands } from './panes';

export default class VimExtras extends Plugin {
	onload(): void {
		registerPaneCommands(this);
		this.addCommand({
			id: 'toggle-heading-fold',
			name: 'Toggle heading fold',
			editorCheckCallback: (checking, editor) => toggleHeadingFold(editor, checking),
		});
		this.registerEditorExtension(normalModeTab(view => {
			const editor = this.app.workspace.activeEditor?.editor;
			if (editor && getEditorView(this.app) === view) toggleHeadingFold(editor);
		}));
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
