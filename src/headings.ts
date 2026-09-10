import type { HeadingMotionArgs, VimBuffer, VimPosition } from './types';

// ATX headings, matching the heading style supported by Vimrc Support.
// Scan the live buffer so edits are immediately navigable.
export function headingPositions(text: string): VimPosition[] {
	const lines = text.split(/\r?\n/);
	const headings: VimPosition[] = [];
	let frontmatter = lines[0]?.replace(/^\uFEFF/, '') === '---';
	let fence: string | null = null;
	for (let line = 0; line < lines.length; line++) {
		const value = lines[line]!;
		if (frontmatter) {
			if (line > 0 && /^(---|\.\.\.)\s*$/.test(value)) frontmatter = false;
			continue;
		}
		if (fence) {
			const close = value.match(/^ {0,3}(`{3,}|~{3,})[\t ]*$/);
			if (close && close[1]![0] === fence[0] && close[1]!.length >= fence.length) fence = null;
			continue;
		}
		const open = value.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
		if (open && (open[1]![0] !== '`' || !open[2]!.includes('`'))) {
			fence = open[1]!;
			continue;
		}
		const heading = value.match(/^( {0,3})#{1,6}(?:[\t ]|$)/);
		if (heading) headings.push({ line, ch: heading[1]!.length });
	}
	return headings;
}

export function jumpToHeading(cm: VimBuffer, cursor: VimPosition, { forward, repeat = 1 }: HeadingMotionArgs): VimPosition {
	const positions = headingPositions(cm.getValue()).filter(position =>
		forward ? position.line > cursor.line : position.line < cursor.line);
	if (!forward) positions.reverse();
	// Stay put at the boundary; a large count stops at the last heading.
	return positions[Math.min(Math.max(1, repeat), positions.length) - 1] || cursor;
}

