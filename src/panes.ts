import type { App, Plugin } from 'obsidian';

// Obsidian's command registry is internal; keep access guarded and local.
type AppWithCommands = App & {
	commands?: { executeCommandById(id: string): boolean };
};

export function registerPaneCommands(plugin: Plugin): void {
	const directions = [
		['left', 'left'],
		['down', 'bottom'],
		['up', 'top'],
		['right', 'right'],
	] as const;
	for (const [direction, nativeDirection] of directions) {
		plugin.addCommand({
			id: `focus-pane-${direction}`,
			name: `Focus pane ${direction}`,
			callback: () => {
				(plugin.app as AppWithCommands).commands?.executeCommandById(`editor:focus-${nativeDirection}`);
			},
		});
	}
}

export function cyclePaneTab(app: App, forward: boolean): void {
	(app as AppWithCommands).commands?.executeCommandById(
		`workspace:${forward ? 'next' : 'previous'}-tab`,
	);
}
