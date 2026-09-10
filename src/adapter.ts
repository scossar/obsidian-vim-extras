import type { App, Editor } from 'obsidian';
import type { InternalEditorView, VimApi } from './types';

export function getEditorView(app: App): InternalEditorView | undefined {
	const editor: (Editor & { cm?: InternalEditorView }) | undefined =
		app.workspace.activeEditor?.editor;
	return editor?.cm;
}

export function getVimApi(doc: Document): VimApi | undefined {
	const win = doc.defaultView as
		(Window & { CodeMirrorAdapter?: { Vim?: VimApi } }) | null;
	return win?.CodeMirrorAdapter?.Vim;
}
