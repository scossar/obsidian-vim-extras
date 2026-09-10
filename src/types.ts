// Minimal structural types for Obsidian's private CodeMirror Vim adapter.
// Keep this boundary local: these members are not part of the public API.
export interface VimPosition {
	line: number;
	ch: number;
}

export interface VimBuffer {
	getValue(): string;
}

export interface HeadingMotionArgs {
	forward: boolean;
	repeat?: number;
}

export interface Yank {
	text: string;
	linewise: boolean;
	blockwise: boolean;
}

export interface VimRegister {
	linewise?: boolean;
	blockwise?: boolean;
	toString(): string;
	setText(text: string, linewise: boolean, blockwise: boolean): void;
}

export interface VimState {
	insertMode?: boolean;
	visualMode?: boolean;
	mode?: string;
	expectLiteralNext?: boolean;
	inputState?: {
		keyBuffer?: string[];
		registerName?: string | null;
		operator?: unknown;
	};
}

export interface VimApi {
	defineMotion(name: string, motion: (cm: VimBuffer, cursor: VimPosition, args: HeadingMotionArgs) => VimPosition): void;
	mapCommand(keys: string, type: 'motion', name: string, args: HeadingMotionArgs, options: { isJump: boolean }): void;
	unmap(keys: string): void;
	getRegisterController(): { getRegister(): VimRegister };
}

export interface InternalEditorView {
	contentDOM?: HTMLElement;
	dom: HTMLElement;
	cm?: { state?: { vim?: VimState } };
}
