# Vim Extras

Small additions to Obsidian's built-in Vim mode. Desktop only; no dependencies or build step.

Enable **Settings → Editor → Vim key bindings**, then enable **Vim Extras** under Community plugins. Keep Vim Motions disabled.

## Clipboard

- Visual-mode `y` yanks normally and copies the result to the system clipboard.
- Normal-mode `p` pastes clipboard text using Vim's normal placement, counts, and undo behavior.
- Linewise and blockwise selections retain their shape when pasted back. External text ending in a newline is treated as linewise.
- Explicit named registers (for example `"ay` and `"ap`) keep their ordinary behavior.
- Insert-mode typing, normal-mode yanks, deletes, visual-mode paste, and uppercase `Y`/`P` are unchanged.

This bridges physical key presses; macro playback and custom mappings that invoke `y`/`p` internally are not intercepted. Clipboard shape is remembered in memory by matching text, since the system text clipboard has no Vim register metadata.

## Heading navigation

- `]]` jumps to the next heading; `[[` jumps to the previous heading.
- Counts work: `3]]` jumps forward three headings, or to the last available heading.
- The current heading line is skipped. Navigation stops at the first/last heading without wrapping.
- Uses native Vim motions, including visual selection and operator-pending mode. Insert-mode brackets are unchanged.
- Reads the live buffer and recognizes `#` through `######` headings, including up to three leading spaces. Skips YAML frontmatter and backtick/tilde fenced code blocks.
- Underlined (Setext) headings and headings inside blockquotes/lists are not included.

The plugin uses Electron's clipboard API and Obsidian's internal CodeMirror Vim adapter. Disabling it removes its event listeners and heading mappings. Obsidian updates that change the internal editor adapter may require a plugin update.

## Development

Edit the JavaScript files directly and reload the plugin. Run `node --test *.test.cjs` from this plugin directory.
