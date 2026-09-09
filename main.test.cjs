const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');

function setup() {
  const state = { clipboard: 'external', reads: 0, writes: 0, notices: [], tasks: [], microtasks: [], listeners: [] };
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
    setTimeout: task => state.tasks.push(task),
    console: { error() {} },
    require(name) {
      if (name === 'electron') return { clipboard: {
        readText() { state.reads++; if (state.readError) throw Error('unavailable'); return state.clipboard; },
        writeText(text) { if (state.writeError) throw Error('unavailable'); state.writes++; state.clipboard = text; },
      } };
      assert.equal(name, 'obsidian');
      return { Plugin: class {
        registerEvent() {}
        registerDomEvent(...args) { state.listeners.push(args); }
      }, Notice: class { constructor(message) { state.notices.push(message); } } };
    },
  });
  const plugin = new module.exports();
  plugin.app = { workspace: {
    activeEditor: { editor: { cm: view } }, on() {}, getLeavesOfType() { return []; },
  } };
  plugin.onload();
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
  plugin.attachDocument(doc); plugin.attachDocument({});
  assert.equal(state.listeners.length, 2);
  assert.equal(state.listeners[0][1], 'keydown');
  assert.equal(state.listeners[0][3], true);
});
