const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { runInThisContext } = require('node:vm');
const { EditorState, Prec } = require('@codemirror/state');
const { keymap, runScopeHandlers } = require('@codemirror/view');

const source = buildSync({
  entryPoints: [`${__dirname}/src/tab.ts`], bundle: true, write: false,
  format: 'cjs', external: ['@codemirror/state', '@codemirror/view'],
}).outputFiles[0].text;
const loaded = { exports: {} };
runInThisContext(`(function(require, module) { ${source}\n})`)(require, loaded);
const { normalModeTab: createNormalModeTab } = loaded.exports;
const normalModeTab = createNormalModeTab();

function press(vim, modifiers = {}, extensions = [normalModeTab]) {
  let indents = 0;
  let unindents = 0;
  const view = {
    state: EditorState.create({ extensions: [
      keymap.of([{ key: 'Tab', run: () => { indents++; return true; },
        shift: () => { unindents++; return true; } }]),
      extensions,
    ] }),
    cm: { state: { vim } },
  };
  const handled = runScopeHandlers(view, { key: 'Tab', keyCode: 9,
    ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers }, 'editor');
  return { handled, indents, unindents };
}

test('normal-mode Tab suppresses the default indent binding', () => {
  for (const vim of [{}, { inputState: { keyBuffer: ['2'] } }, { inputState: { operator: 'delete' } }]) {
    assert.deepEqual(press(vim), { handled: true, indents: 0, unindents: 0 });
  }
});

test('insert, visual, replace and non-Vim editors retain Tab indentation', () => {
  for (const vim of [undefined, { insertMode: true }, { visualMode: true }, { mode: 'replace' }]) {
    assert.equal(press(vim).indents, 1);
  }
});

test('modified Tab is not consumed by the normal-mode fallback', () => {
  assert.equal(press({}, { shiftKey: true }).unindents, 1);
  for (const modifiers of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
    assert.equal(press({}, modifiers).handled, false);
  }
});

test('higher-priority Tab commands still execute', () => {
  let commands = 0;
  const command = Prec.highest(keymap.of([{ key: 'Tab', run: () => { commands++; return true; } }]));
  assert.equal(press({}, {}, [normalModeTab, command]).indents, 0);
  assert.equal(commands, 1);
});

test('removing the extension restores the original Tab binding', () => {
  assert.equal(press({}, {}, []).indents, 1);
});

 test('Tab invokes the heading action only in normal mode', () => {
  let calls = 0;
  const extension = createNormalModeTab(() => { calls++; });
  press({}, {}, [extension]);
  assert.equal(calls, 1);
  for (const vim of [undefined, { insertMode: true }, { visualMode: true }, { mode: 'replace' }]) {
    press(vim, {}, [extension]);
  }
  press({}, { shiftKey: true }, [extension]);
  assert.equal(calls, 1);
});
