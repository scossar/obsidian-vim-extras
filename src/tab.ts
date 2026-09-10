import { Prec } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import type { InternalEditorView } from './types';

export function isVimNormalMode(view: InternalEditorView): boolean {
	const vim = view.cm?.state?.vim;
	return !!vim && !vim.insertMode && !vim.visualMode && vim.mode !== 'replace';
}

// Obsidian hotkeys and Vim mappings get first refusal. Always consume plain Tab
// in normal mode, including on non-headings, so it never falls through to indent.
export function normalModeTab(onTab: (view: EditorView) => void = () => {}) {
	return Prec.high(keymap.of([
		{ key: 'Tab', run: view => {
			if (!isVimNormalMode(view)) return false;
			onTab(view);
			return true;
		} },
	]));
}
