import type { Editor } from 'obsidian';
import { headingPositions } from './headings';
import { isVimNormalMode } from './tab';
import type { InternalEditorView } from './types';

// Use the live buffer, so unsaved headings work and fenced/frontmatter text does
// not accidentally trigger Obsidian's more general fold command.
export function toggleHeadingFold(editor: Editor, checking = false): boolean {
	const internal: Editor & { cm?: InternalEditorView } = editor;
	if (!internal.cm || !isVimNormalMode(internal.cm)) return false;
	const line = editor.getCursor().line;
	if (!headingPositions(editor.getValue()).some(heading => heading.line === line)) return false;
	if (!checking) editor.exec('toggleFold');
	return true;
}
