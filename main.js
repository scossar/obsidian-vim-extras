const { Plugin, Notice } = require("obsidian");
const { clipboard } = require("electron");

// ATX headings, matching the heading style supported by Vimrc Support.
// Scan the live buffer so edits are immediately navigable.
function headingPositions(text) {
  const lines = text.split(/\r?\n/);
  const headings = [];
  let frontmatter = lines[0]?.replace(/^\uFEFF/, "") === "---";
  let fence = null;
  for (let line = 0; line < lines.length; line++) {
    const value = lines[line];
    if (frontmatter) {
      if (line > 0 && /^(---|\.\.\.)\s*$/.test(value)) frontmatter = false;
      continue;
    }
    if (fence) {
      const close = value.match(/^ {0,3}(`{3,}|~{3,})[\t ]*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      continue;
    }
    const open = value.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (open && (open[1][0] !== "`" || !open[2].includes("`"))) {
      fence = open[1];
      continue;
    }
    const heading = value.match(/^( {0,3})#{1,6}(?:[\t ]|$)/);
    if (heading) headings.push({ line, ch: heading[1].length });
  }
  return headings;
}

function jumpToHeading(cm, cursor, { forward, repeat = 1 }) {
  const positions = headingPositions(cm.getValue()).filter(position =>
    forward ? position.line > cursor.line : position.line < cursor.line);
  if (!forward) positions.reverse();
  // Stay put at the boundary; a large count stops at the last heading.
  return positions[Math.min(Math.max(1, repeat), positions.length) - 1] || cursor;
}

module.exports = class VimExtras extends Plugin {
  onload() {
    this.enabled = true;
    this.documents = new WeakSet();
    this.vimApis = new Set();
    this.lastYank = null;
    this.attachDocument(document);
    this.registerEvent(this.app.workspace.on("window-open", (_workspaceWindow, win) => {
      this.attachDocument(win.document);
    }));
    // Covers existing pop-out windows, including when enabling the plugin later.
    this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
      const doc = leaf.view?.containerEl?.ownerDocument;
      if (doc) this.attachDocument(doc);
    });
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      const doc = this.app.workspace.activeEditor?.editor?.cm?.dom?.ownerDocument;
      if (doc) this.attachDocument(doc);
    }));
  }

  onunload() {
    this.enabled = false;
    for (const api of this.vimApis) {
      api.unmap("]]");
      api.unmap("[[");
    }
  }

  attachDocument(doc) {
    const api = doc.defaultView?.CodeMirrorAdapter?.Vim;
    if (api?.defineMotion && !this.vimApis.has(api)) {
      api.defineMotion("vimExtrasHeading", jumpToHeading);
      api.mapCommand("]]", "motion", "vimExtrasHeading", { forward: true }, { isJump: true });
      api.mapCommand("[[", "motion", "vimExtrasHeading", { forward: false }, { isJump: true });
      this.vimApis.add(api);
    }
    if (this.documents.has(doc)) return;
    this.documents.add(doc);
    this.registerDomEvent(doc, "keydown", (event) => this.onKeydown(event), true);
  }

  onKeydown(event) {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey ||
        event.metaKey || event.altKey || !["y", "p"].includes(event.key)) return;

    const editorView = this.app.workspace.activeEditor?.editor?.cm;
    if (!editorView?.contentDOM?.contains(event.target)) return;
    // Obsidian's internal CodeMirror Vim adapter; guarded for non-Vim editors.
    const cm = editorView.cm;
    const vim = cm?.state?.vim;
    const api = editorView.dom.ownerDocument.defaultView.CodeMirrorAdapter?.Vim;
    if (!vim || !api || vim.insertMode || vim.mode === "replace" ||
        vim.expectLiteralNext) return;
    const input = vim.inputState;
    // Respect explicit registers and pending commands such as fp, rp, or "ap.
    const pendingKeys = (input?.keyBuffer || []).join("");
    if (input?.registerName || input?.operator || /[^0-9]/.test(pendingKeys)) return;

    const register = api.getRegisterController().getRegister();
    if (event.key === "y" && vim.visualMode) {
      // Let Vim finish the yank first, including inclusive/line/block selection
      // handling and updating its own register. Do not guess from DOM selection.
      // Real keyboard events run microtasks between DOM listeners, so a
      // microtask here runs BEFORE CodeMirror handles the key. A timer waits
      // until the entire key event has finished propagating.
      setTimeout(() => {
        if (!this.enabled || vim.visualMode || event.defaultPrevented === false) return;
        try {
          const text = register.toString();
          clipboard.writeText(text);
          this.lastYank = { text, linewise: register.linewise, blockwise: register.blockwise };
        } catch (error) {
          this.reportError("copy to", error);
        }
      }, 0);
    } else if (event.key === "p" && !vim.visualMode) {
      try {
        // Electron's synchronous API avoids racing the Vim paste operation.
        const text = clipboard.readText();
        const ownYank = this.lastYank?.text === text ? this.lastYank : null;
        register.setText(text, ownYank ? ownYank.linewise : text.endsWith("\n"),
          ownYank?.blockwise || false);
      } catch (error) {
        // A failed clipboard read must not silently paste stale register text.
        event.preventDefault();
        event.stopImmediatePropagation();
        this.reportError("paste from", error);
      }
    }
  }

  reportError(action, error) {
    console.error(`Vim Extras: could not ${action} clipboard`, error);
    new Notice(`Vim Extras: could not ${action} the system clipboard.`);
  }
};

// Exposed for dependency-free unit tests.
module.exports.headingPositions = headingPositions;
module.exports.jumpToHeading = jumpToHeading;
