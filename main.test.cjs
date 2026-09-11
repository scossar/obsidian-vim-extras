const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

function setup() {
  const state = { clipboard: 'external', reads: 0, writes: 0, notices: [], tasks: [], microtasks: [], listeners: [], cleanups: [], events: {} };
  const register = {
    text: 'internal', linewise: false, blockwise: false,
    toString() { return this.text; },
    setText(text, linewise, blockwise) { Object.assign(this, {text, linewise, blockwise}); },
  };
  const vim = { inputState: { keyBuffer: [], registerName: null }, visualMode: false };
  const api = { getRegisterController: () => ({ getRegister: () => register }) };
  const doc = { defaultView: { CodeMirrorAdapter: { Vim: api } } };
  const content = {};
  const view = { contentDOM: { contains: target => target === content },
    dom: { ownerDocument: doc }, cm: { state: { vim } } };
  const module = { exports: {} };
  runInNewContext(readFileSync(`${__dirname}/main.js`, 'utf8'), {
    module, document: doc, queueMicrotask: task => state.microtasks.push(task),
    window: {
      setTimeout: task => { state.tasks.push(task); return state.tasks.length; },
      clearTimeout: id => { state.tasks[id - 1] = () => {}; },
    },
    console: { error() {} },
    require(name) {
      if (name === 'electron') return { clipboard: {
        readText() { state.reads++; if (state.readError) throw Error('unavailable'); return state.clipboard; },
        writeText(text) { if (state.writeError) throw Error('unavailable'); state.writes++; state.clipboard = text; },
      } };
      if (name === '@codemirror/state') return { Prec: { high: value => value } };
      if (name === '@codemirror/view') return { keymap: { of: value => value } };
      assert.equal(name, 'obsidian');
      return { Plugin: class {
        registerEvent() {}
        addCommand(command) { state.command = command; }
        registerEditorExtension() {}
        register(callback) { state.cleanups.push(callback); }
        onunload() { state.cleanups.forEach(callback => callback()); }
        registerDomEvent(...args) { state.listeners.push(args); }
      }, Notice: class { constructor(message) { state.notices.push(message); } } };
    },
  });
  const plugin = new module.exports.default();
  plugin.app = { workspace: {
    activeEditor: { editor: { cm: view } }, on(name, callback) { state.events[name] = callback; }, getLeavesOfType() { return []; },
  } };
  plugin.onload();
  plugin.onKeydown = event => state.listeners[0][2](event);
  const event = (key, extra = {}) => ({ key, target: content, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.stopped = true; }, ...extra });
  const flush = () => { while (state.tasks.length) state.tasks.shift()(); };
  return { plugin, state, vim, register, event, flush, doc };
}

test('visual yank waits for native Vim and preserves blockwise metadata', () => {
  const { plugin, state, vim, register, event, flush } = setup();
  vim.visualMode = true;
  const e = event('y');
  plugin.onKeydown(e);
  // Native events have a microtask checkpoint after the capturing listener,
  // before CodeMirror's listener performs the yank. dispatchEvent hides this.
  while (state.microtasks.length) state.microtasks.shift()();
  assert.equal(state.writes, 0);
  register.setText('ab\ncd', false, true);
  vim.visualMode = false;
  e.preventDefault();
  flush();
  assert.equal(state.clipboard, 'ab\ncd');
  register.setText('deleted', false, false);
  plugin.onKeydown(event('p'));
  assert.equal(register.text, 'ab\ncd');
  assert.equal(register.blockwise, true);
});

test('paste accepts counts and treats external trailing newline as linewise', () => {
  const { plugin, state, vim, register, event } = setup();
  vim.inputState.keyBuffer = ['2'];
  state.clipboard = 'line\n';
  plugin.onKeydown(event('p'));
  assert.equal(register.text, 'line\n');
  assert.equal(register.linewise, true);
  assert.equal(register.blockwise, false);
  state.clipboard = '';
  plugin.onKeydown(event('p'));
  assert.equal(register.text, '');
  assert.equal(register.linewise, false);
});

test('named registers, pending commands and non-normal modes are untouched', () => {
  for (const configure of [
    x => { x.vim.inputState.registerName = 'a'; },
    x => { x.vim.inputState.keyBuffer = ['f']; },
    x => { x.vim.inputState.keyBuffer = ['r']; },
    x => { x.vim.inputState.operator = 'delete'; },
    x => { x.vim.insertMode = true; },
    x => { x.vim.visualMode = true; },
    x => { x.vim.expectLiteralNext = true; },
  ]) {
    const x = setup(); configure(x); x.plugin.onKeydown(x.event('p'));
    assert.equal(x.state.reads, 0);
    assert.equal(x.register.text, 'internal');
  }
});

test('modifiers, composition, other controls and uppercase bindings are untouched', () => {
  for (const extra of [{ctrlKey:true}, {metaKey:true}, {altKey:true},
    {isComposing:true}, {defaultPrevented:true}, {target:{}}, {key:'P'}]) {
    const x = setup(); x.plugin.onKeydown(x.event('p', extra));
    assert.equal(x.state.reads, 0);
  }
});

test('read failure blocks stale paste and reports the problem', () => {
  const { plugin, state, register, event } = setup();
  state.readError = true;
  const e = event('p'); plugin.onKeydown(e);
  assert.equal(e.defaultPrevented, true);
  assert.equal(e.stopped, true);
  assert.equal(register.text, 'internal');
  assert.equal(state.notices.length, 1);
});

test('unfinished yank and unload cannot copy stale register contents', () => {
  for (const unload of [false, true]) {
    const { plugin, state, vim, event, flush } = setup();
    vim.visualMode = true;
    const e = event('y'); plugin.onKeydown(e); e.preventDefault();
    if (unload) { vim.visualMode = false; plugin.onunload(); }
    flush(); assert.equal(state.writes, 0);
  }
});

test('clipboard write failure preserves the native yank and reports failure', () => {
  const { plugin, state, vim, register, event, flush } = setup();
  vim.visualMode = true; state.writeError = true;
  const e = event('y'); plugin.onKeydown(e);
  register.setText('yanked', false, false); vim.visualMode = false; e.preventDefault(); flush();
  assert.equal(register.text, 'yanked');
  assert.equal(state.notices.length, 1);
});

test('each document gets one capturing listener registered for plugin cleanup', () => {
  const { plugin, state, doc } = setup();
  state.events['window-open'](null, { document: doc });
  state.events['window-open'](null, { document: {} });
  assert.equal(state.listeners.length, 2);
  assert.equal(state.listeners[0][1], 'keydown');
  assert.equal(state.listeners[0][3], true);
});

test('heading fold command checks availability without folding and toggles through Obsidian', () => {
  const { plugin, state } = setup();
  const calls = [];
  const editor = plugin.app.workspace.activeEditor.editor;
  Object.assign(editor, {
    getCursor: () => ({ line: 2, ch: 5 }),
    getValue: () => '# Parent\nbody\n## Child\nchild body',
    exec: name => calls.push(name),
  });
  assert.equal(state.command.id, 'toggle-heading-fold');
  assert.equal(state.command.editorCheckCallback(true, editor), true);
  assert.equal(calls.length, 0);
  assert.equal(state.command.editorCheckCallback(false, editor), true);
  assert.equal(state.command.editorCheckCallback(false, editor), true);
  assert.deepEqual(calls, ['toggleFold', 'toggleFold']);
});

test('heading fold command rejects body lines, fenced headings and frontmatter', () => {
  for (const [text, line] of [
    ['# Heading\nbody', 1], ['```\n# Code\n```', 1], ['---\n# YAML\n---', 1],
    ['> # Quote', 0], ['    # Indented code', 0],
  ]) {
    const { plugin, state } = setup();
    const editor = plugin.app.workspace.activeEditor.editor;
    Object.assign(editor, {
      getCursor: () => ({ line, ch: 0 }), getValue: () => text,
      exec: () => assert.fail('must not fold'),
    });
    assert.equal(state.command.editorCheckCallback(false, editor), false);
  }
});

test('heading fold command is unavailable outside normal Vim mode', () => {
  for (const mode of [{ insertMode: true }, { visualMode: true }, { mode: 'replace' }, null]) {
    const { plugin, state } = setup();
    const editor = plugin.app.workspace.activeEditor.editor;
    editor.cm.cm.state.vim = mode;
    Object.assign(editor, {
      getCursor: () => ({ line: 0, ch: 0 }), getValue: () => '# Heading\nbody',
      exec: () => assert.fail('must not fold'),
    });
    assert.equal(state.command.editorCheckCallback(false, editor), false);
  }
});

test('normal H/L cycle pane tabs and J/K are consumed without editing', () => {
  for (const key of ['H', 'J', 'K', 'L']) {
    const x = setup();
    const commands = [];
    x.plugin.app.commands = { executeCommandById: id => commands.push(id) };
    const e = x.event(key, { shiftKey: true });
    x.plugin.onKeydown(e);
    assert.equal(e.defaultPrevented, true);
    assert.equal(e.stopped, true);
    assert.deepEqual(commands, key === 'H' ? ['workspace:previous-tab'] :
      key === 'L' ? ['workspace:next-tab'] : []);
    assert.equal(x.state.reads, 0);
  }
});

test('shift navigation preserves typing, selections, pending commands and other controls', () => {
  for (const key of ['H', 'J', 'K', 'L']) {
    for (const configure of [
      x => { x.vim.insertMode = true; },
      x => { x.vim.visualMode = true; },
      x => { x.vim.mode = 'replace'; },
      x => { x.vim.expectLiteralNext = true; },
      x => { x.vim.inputState.keyBuffer = ['f']; },
      x => { x.vim.inputState.keyBuffer = ['2']; },
      x => { x.vim.inputState.operator = 'delete'; },
      x => { x.vim.inputState.registerName = 'a'; },
      (x, e) => { e.target = {}; },
      (x, e) => { e.ctrlKey = true; },
      (x, e) => { e.altKey = true; },
      (x, e) => { e.metaKey = true; },
      (x, e) => { e.isComposing = true; },
    ]) {
      const x = setup();
      x.plugin.app.commands = { executeCommandById: () => assert.fail('must not switch tabs') };
      const e = x.event(key, { shiftKey: true });
      configure(x, e);
      x.plugin.onKeydown(e);
      assert.equal(e.defaultPrevented, false);
    }
  }
});
