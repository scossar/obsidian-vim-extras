import { Notice, type Plugin } from 'obsidian';
import { clipboard } from 'electron';
import { jumpToHeading } from './headings';
import { getEditorView, getVimApi } from './adapter';
import type { VimApi, Yank } from './types';
import { cyclePaneTab } from './panes';

export class VimExtrasController {
	private enabled = true;
	private readonly documents = new WeakSet<Document>();
	private readonly vimApis = new Set<VimApi>();
	private lastYank: Yank | null = null;
	private readonly pendingYanks = new Set<number>();

	constructor(private readonly plugin: Plugin) {}

	unload(): void {
		this.enabled = false;
		for (const timer of this.pendingYanks) window.clearTimeout(timer);
		this.pendingYanks.clear();
		for (const api of this.vimApis) {
			api.unmap(']]');
			api.unmap('[[');
		}
		this.vimApis.clear();
	}

	attachDocument(doc: Document): void {
		const api = getVimApi(doc);
		if (api?.defineMotion && !this.vimApis.has(api)) {
			api.defineMotion('vimExtrasHeading', jumpToHeading);
			api.mapCommand(']]', 'motion', 'vimExtrasHeading', { forward: true }, { isJump: true });
			api.mapCommand('[[', 'motion', 'vimExtrasHeading', { forward: false }, { isJump: true });
			this.vimApis.add(api);
		}
		if (this.documents.has(doc)) return;
		this.documents.add(doc);
		this.plugin.registerDomEvent(doc, 'keydown', (event) => this.onKeydown(event), true);
	}

	onKeydown(event: KeyboardEvent): void {
		if (event.defaultPrevented || event.isComposing || event.ctrlKey ||
				event.metaKey || event.altKey || !['y', 'p', 'H', 'J', 'K', 'L'].includes(event.key)) return;

		const editorView = getEditorView(this.plugin.app);
		if (!editorView?.contentDOM?.contains(event.target as Node | null)) return;
		// Obsidian's internal CodeMirror Vim adapter; guarded for non-Vim editors.
		const cm = editorView.cm;
		const vim = cm?.state?.vim;
		const api = getVimApi(editorView.dom.ownerDocument);
		if (!vim || !api || vim.insertMode || vim.mode === 'replace' ||
				vim.expectLiteralNext) return;
		const input = vim.inputState;
		// Respect explicit registers and pending commands (find, replace, named paste).
		const pendingKeys = (input?.keyBuffer || []).join('');
		if (input?.registerName || input?.operator || /[^0-9]/.test(pendingKeys)) return;

		if (['H', 'J', 'K', 'L'].includes(event.key)) {
			if (vim.visualMode || pendingKeys) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if (event.key === 'H' || event.key === 'L') {
				cyclePaneTab(this.plugin.app, event.key === 'L');
			}
			return;
		}

		const register = api.getRegisterController().getRegister();
		if (event.key === 'y' && vim.visualMode) {
			// Let Vim finish the yank first, including inclusive/line/block selection
			// handling and updating its own register. Do not guess from DOM selection.
			// Real keyboard events run microtasks between DOM listeners, so a
			// microtask here runs BEFORE CodeMirror handles the key. A timer waits
			// until the entire key event has finished propagating.
			const timer = window.setTimeout(() => {
				this.pendingYanks.delete(timer);
				if (!this.enabled || vim.visualMode || event.defaultPrevented === false) return;
				try {
					const text = register.toString();
					clipboard.writeText(text);
					this.lastYank = { text, linewise: !!register.linewise, blockwise: !!register.blockwise };
				} catch (error) {
					this.reportError('copy to', error);
				}
			}, 0);
			this.pendingYanks.add(timer);
		} else if (event.key === 'p' && !vim.visualMode) {
			try {
				// Electron's synchronous API avoids racing the Vim paste operation.
				const text = clipboard.readText();
				const ownYank = this.lastYank?.text === text ? this.lastYank : null;
				register.setText(text, ownYank ? ownYank.linewise : text.endsWith('\n'),
					ownYank?.blockwise || false);
			} catch (error) {
				// A failed clipboard read must not silently paste stale register text.
				event.preventDefault();
				event.stopImmediatePropagation();
				this.reportError('paste from', error);
			}
		}
	}

	reportError(action: string, error: unknown): void {
		console.error(`Vim Extras: could not ${action} clipboard`, error);
		new Notice(`Vim Extras: could not ${action} the system clipboard.`);
	}
}
