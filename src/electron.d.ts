// Obsidian supplies Electron at runtime. Declare only the synchronous clipboard
// surface we use, without installing or bundling another Electron runtime.
declare module 'electron' {
	export const clipboard: {
		readText(): string;
		writeText(text: string): void;
	};
}
