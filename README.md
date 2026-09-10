# Vim Extras

Small additions to Obsidian's built-in Vim mode. Desktop only. Written in TypeScript and bundled into `main.js`; no additional runtime installation is needed.

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

The project follows the [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin) structure and its `AGENTS.md` guidance. Use Node.js 22 or 24 and npm.

```sh
npm ci
npm run build
npm run lint
npm test
```

Run `npm run dev` to watch for changes. Reload Vim Extras in Obsidian after building to load the new bundle.

- `src/main.ts`: plugin lifecycle and workspace events.
- `src/vim-extras.ts`: clipboard handling, document listeners, and Vim mappings.
- `src/headings.ts`: live-buffer heading parsing and motions.
- `src/adapter.ts` and `src/types.ts`: typed boundary around Obsidian's private editor adapter.
- `src/electron.d.ts`: the clipboard API supplied by Obsidian's Electron runtime.

`npm test` builds the plugin and runs the clipboard and heading regression tests. Tests mock Obsidian and Electron; manually verify visual `y`, normal `p`, `[[` / `]]`, counts, and pop-out windows in Obsidian after changes to editor integration.

`main.js` is generated; edit `src/` instead. Do not commit `main.js` or `node_modules/`. To install elsewhere, copy the built `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/vim-extras/`. This plugin does not need `styles.css`.

The GitHub workflows build, lint, and test pushes and pull requests, and prepare a draft release for version tags. Use `npm version patch` (or `minor` / `major`) to update the package, manifest, and compatibility map; release tags use the version without a `v` prefix.

All plugin features run locally. Clipboard text is handled in memory; the plugin makes no network requests.
