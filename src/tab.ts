import { Prec } from '@codemirror/state';
import { keymap, type EditorView } from '@codemirror/view';
import type { InternalEditorView } from './types';

export function suppressNormalModeTab(view: EditorView): boolean {
	const vim = (view as EditorView & InternalEditorView).cm?.state?.vim;
	return !!vim && !vim.insertMode && !vim.visualMode && vim.mode !== 'replace';
}

// Vim's DOM handler and Obsidian's hotkey scope get first refusal. Consume an
// unhandled Tab before the editor's default indent binding. No global DOM
// cancellation: insert/visual mode, modified Tab, and other controls are untouched.
export const normalModeTab = Prec.high(keymap.of([
	{ key: 'Tab', run: suppressNormalModeTab },
]));
