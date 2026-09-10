const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { runInThisContext } = require('node:vm');
const pluginModule = {exports: {}};
const source = buildSync({ entryPoints: [`${__dirname}/src/headings.ts`], bundle: true, write: false, format: 'cjs' }).outputFiles[0].text;
const load = runInThisContext(`(function(require, module) { ${source}\n})`);
load(() => ({Plugin: class {}}), pluginModule);
const { headingPositions, jumpToHeading } = pluginModule.exports;

test('recognizes ATX headings, including indentation, tabs and empty headings', () => {
  const text = '# One\ntext\n  ## Two\n######\n###\tThree\n####### invalid\n#no-space\n    # code\n> # quoted\nSetext\n======';
  assert.deepEqual(headingPositions(text), [{line:0,ch:0},{line:2,ch:2},{line:3,ch:0},{line:4,ch:0}]);
});

test('skips YAML, tilde and backtick fences, including longer and unclosed fences', () => {
  const text = ['---', '# yaml', '---', '# One', '````md', '# code', '```', '# still code', '````',
    '~~~', '# tilde code', '~~~~', '## Two', '```', '# unclosed'].join('\n');
  assert.deepEqual(headingPositions(text), [{line:3,ch:0},{line:12,ch:0}]);
});

test('fence closers must match character, length and contain no info string', () => {
  const text = ['# One','  ~~~~lang', '```', '~~~', '~~~~ info', '# code', '   ~~~~  ', '# Two'].join('\n');
  assert.deepEqual(headingPositions(text), [{line:0,ch:0},{line:7,ch:0}]);
});

test('frontmatter is only recognized at document start; CRLF and BOM are supported', () => {
  assert.deepEqual(headingPositions('\uFEFF---\r\n# yaml\r\n...\r\n# Real\r\n---\r\n## Also real'),
    [{line:3,ch:0},{line:5,ch:0}]);
});

test('motions skip current heading, honor counts and stop at boundaries', () => {
  const cm = { getValue: () => '# One\nbody\n## Two\nbody\n### Three' };
  assert.deepEqual(jumpToHeading(cm,{line:0,ch:3},{forward:true}),{line:2,ch:0});
  assert.deepEqual(jumpToHeading(cm,{line:0,ch:0},{forward:true,repeat:2}),{line:4,ch:0});
  assert.deepEqual(jumpToHeading(cm,{line:4,ch:5},{forward:false,repeat:99}),{line:0,ch:0});
  assert.deepEqual(jumpToHeading(cm,{line:2,ch:0},{forward:true,repeat:99}),{line:4,ch:0});
  assert.deepEqual(jumpToHeading(cm,{line:0,ch:3},{forward:false}),{line:0,ch:3});
  assert.deepEqual(jumpToHeading(cm,{line:4,ch:3},{forward:true}),{line:4,ch:3});
});

test('empty documents are unchanged and unsaved edits are picked up immediately', () => {
  let text = 'body';
  const cm = {getValue: () => text};
  const cursor = {line:0,ch:1};
  assert.equal(jumpToHeading(cm,cursor,{forward:true}),cursor);
  text += '\n# Newly typed';
  assert.deepEqual(jumpToHeading(cm,cursor,{forward:true}),{line:1,ch:0});
});
