'use strict';

// Liquorify's independent verification of the GHSA-vfj7-8cjw-p6xm patch.
//
//   node liquorify/verify.js --reference <dir-of-published-braces-3.0.3>
//
// <dir> is an extracted `npm pack braces@3.0.3` with fill-range resolvable
// from it. Every check runs against this checkout's lib/; the reference is
// used only to reproduce the original failure and for differential
// compatibility. Exits non-zero on any failure. Not part of the published
// package (package.json "files" ships only index.js and lib/).

const assert = require('assert').strict;
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const mode = args[0] === '--child' ? args[1] : null;
const patched = require(path.join(__dirname, '..'));

// Child modes run in a separate process so stack size and hangs are isolated.
if (mode === 'deep-input') {
  const p = '{'.repeat(4999) + '}'.repeat(4999);
  const lib = require(args[2]);
  for (const fn of ['compile', 'expand', 'stringify', 'parse']) {
    try {
      lib[fn](p);
      console.log(`${fn}:ok`);
    } catch (e) {
      console.log(`${fn}:${e.constructor.name}:${e.message}`);
    }
  }
  process.exit(0);
}
if (mode === 'deep-ast') {
  const lib = require(args[2]);
  for (const fn of ['compile', 'expand', 'stringify']) {
    let ast = { type: 'text', value: 'a' };
    for (let i = 0; i < 50000; i++) ast = { type: 'brace', nodes: [ast] };
    ast = { type: 'root', nodes: [ast] };
    try {
      lib[fn](ast);
      console.log(`${fn}:ok`);
    } catch (e) {
      console.log(`${fn}:${e.constructor.name}:${e.message}`);
    }
  }
  process.exit(0);
}
if (mode === 'parent-cycle') {
  const lib = require(args[2]);
  const a = { type: 'paren', nodes: [{ type: 'text', value: 'x' }] };
  const b = { type: 'paren', nodes: [a] };
  a.parent = b;
  b.parent = a;
  try {
    lib.expand(b);
    console.log('expand:ok');
  } catch (e) {
    console.log(`expand:${e.constructor.name}:${e.message}`);
  }
  process.exit(0);
}

const refIndex = args.indexOf('--reference');
if (refIndex === -1 || !args[refIndex + 1]) {
  console.error('usage: node liquorify/verify.js --reference <dir>');
  process.exit(2);
}
const refDir = path.resolve(args[refIndex + 1]);
const reference = require(refDir);
assert.equal(require(path.join(refDir, 'package.json')).version, '3.0.3');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  }
};
const child = (childMode, lib, flags = []) => {
  const r = spawnSync(process.execPath, [...flags, __filename, '--child', childMode, lib], {
    encoding: 'utf8',
    timeout: 5000
  });
  return { timedOut: Boolean(r.error && r.error.code === 'ETIMEDOUT'), lines: (r.stdout || '').trim().split('\n') };
};
const nest = (n, inner = 'a,b', open = '{', close = '}') => open.repeat(n) + inner + close.repeat(n);
const throwsDepth = (fn, re = /exceeds max depth/) =>
  assert.throws(fn, e => (e instanceof SyntaxError || e instanceof RangeError) && re.test(e.message));
const MODES = {
  compile: (lib, p, o) => lib(p, o),
  expandOpt: (lib, p, o) => lib(p, { ...o, expand: true }),
  expand: (lib, p, o) => lib.expand(p, o),
  stringify: (lib, p, o) => lib.stringify(p, o),
  parse: (lib, p, o) => lib.parse(p, o)
};

// 1. The original excessive-nesting failure is reproduced on 3.0.3 and prevented.
const deepRoot = path.join(__dirname, '..');
check('reference 3.0.3 reproduces the stack overflow', () => {
  const r = child('deep-input', refDir);
  assert.ok(r.lines.includes('expand:RangeError:Maximum call stack size exceeded'), r.lines.join(' | '));
});
for (const flags of [[], ['--stack-size=300']]) {
  check(`deep input is rejected before recursion ${flags.join(' ')}`, () => {
    const r = child('deep-input', deepRoot, flags);
    for (const fn of ['compile', 'expand', 'stringify', 'parse'])
      assert.ok(r.lines.includes(`${fn}:SyntaxError:Input depth (101), exceeds max depth (100)`), r.lines.join(' | '));
  });
}

// 2. Depth boundary.
check('nesting 100 is accepted by every entry point', () => {
  for (const [open, close] of [['{', '}'], ['(', ')']])
    for (const run of Object.values(MODES)) run(patched, nest(100, 'a,b', open, close), {});
  for (const run of Object.values(MODES)) run(patched, '{'.repeat(50) + '('.repeat(50) + 'a' + ')'.repeat(50) + '}'.repeat(50), {});
});
check('nesting 101 is rejected by every entry point', () => {
  for (const [open, close] of [['{', '}'], ['(', ')']])
    for (const run of Object.values(MODES)) throwsDepth(() => run(patched, nest(101, 'a,b', open, close), {}), /Input depth \(101\)/);
  for (const run of Object.values(MODES))
    throwsDepth(() => run(patched, '{'.repeat(50) + '('.repeat(51) + 'a' + ')'.repeat(51) + '}'.repeat(50), {}));
});
check('sequential and unmatched closers do not accumulate depth', () => {
  patched('{a,b}'.repeat(500));
  patched.expand('{a}'.repeat(500));
  patched('}'.repeat(500) + nest(100));
  patched(')'.repeat(500) + nest(100));
});
check('unclosed openers count toward depth', () => {
  patched('{'.repeat(100) + 'a');
  throwsDepth(() => patched('{'.repeat(101) + 'a'));
});
check('maxDepth lowers, never raises, the limit', () => {
  patched(nest(2), { maxDepth: 2 });
  throwsDepth(() => patched(nest(3), { maxDepth: 2 }));
  patched(nest(1), { maxDepth: 1.5 });
  throwsDepth(() => patched(nest(2), { maxDepth: 1.5 }));
  throwsDepth(() => patched(nest(101), { maxDepth: 1000 }));
  throwsDepth(() => patched('{a}', { maxDepth: 0 }));
  patched('a', { maxDepth: 0 });
  for (const maxDepth of [NaN, Infinity, -Infinity, '5', null, undefined]) {
    patched(nest(100), { maxDepth });
    throwsDepth(() => patched(nest(101), { maxDepth }));
  }
});

// 3. Caller-supplied AST recursion is bounded.
const ladder = n => {
  let ast = { type: 'text', value: 'a' };
  for (let i = 0; i < n; i++) ast = { type: 'brace', nodes: [ast] };
  return { type: 'root', nodes: [ast] };
};
check('caller AST at depth 100 is accepted, 101 rejected', () => {
  for (const fn of ['compile', 'expand', 'stringify']) {
    patched[fn](ladder(100));
    throwsDepth(() => patched[fn](ladder(101)), /AST depth \(101\)/);
  }
});
check('caller AST at depth 50000 fails with a bounded error under a small stack', () => {
  const r = child('deep-ast', deepRoot, ['--stack-size=300']);
  for (const fn of ['compile', 'expand', 'stringify'])
    assert.ok(r.lines.includes(`${fn}:RangeError:AST depth (101), exceeds max depth (100)`), r.lines.join(' | '));
});
check('a self-containing child cycle is bounded', () => {
  for (const fn of ['compile', 'expand', 'stringify']) {
    const node = { type: 'brace', nodes: [] };
    node.nodes.push(node);
    throwsDepth(() => patched[fn]({ type: 'root', nodes: [node] }), /AST depth/);
  }
});

// 4. Cyclic parent traversal is rejected (3.0.3 loops forever).
check('reference 3.0.3 hangs on a parent cycle', () => {
  assert.ok(child('parent-cycle', refDir).timedOut);
});
check('parent cycles are rejected', () => {
  const r = child('parent-cycle', deepRoot);
  assert.equal(r.timedOut, false);
  assert.deepEqual(r.lines, ['expand:RangeError:AST parent chain contains a cycle']);
  const self = { type: 'paren', nodes: [{ type: 'text', value: 'a' }] };
  self.parent = self;
  assert.throws(() => patched.expand(self), /parent chain contains a cycle/);
});
check('ordinary parsed parent links still expand', () => {
  assert.deepEqual(patched.expand('foo/({a,b})'), ['foo/(a)', 'foo/(b)']);
});

// 5. Differential compatibility with published 3.0.3 (nesting <= 100).
const outcome = (fn) => {
  try {
    return JSON.stringify(fn());
  } catch (e) {
    return `throws ${e.constructor.name}: ${e.message}`;
  }
};
const OPTION_SETS = [
  {},
  { escapeInvalid: true },
  { keepEscaping: true },
  { keepQuotes: true },
  { nodupes: true },
  { rangeLimit: 10 },
  { escapeInvalid: true, keepEscaping: true }
];
const CURATED = [
  'a/{b,c}/d', '{a,b}{c,d}', 'a{,b}c', '{1..5}', '{a..e}', '{1..10..2}', '{-3..3}', '{01..10}',
  '{a,{b,c}}', '{{a,b},c}', '{{a}}', '{a}', '{}', '{,}', '{a,}', '{,a}', 'a/{b}/c', '{a,b}{', '}{a,b}',
  '{{a,b}', '{a,b}}', '\\{a,b}', '{a,\\,b}', '${a,b}', '$({a,b})', 'foo/({a,b})', '*(a|{b|c,d})',
  '{a,b}/{1..3}', '"{a,b}"', "'{a,b}'", '`{a,b}`', '[{a,b}]', '{[a,b]}', '{a..}', '{..a}', '{1..2..0}',
  '{a.b,c}', '{a,b..c}', '{1..1000}', '{a,{b,{c,{d}}}}', '{{{{a}}}}', '((a))', '({a})', '{(a)}',
  nest(50), nest(99), nest(100), nest(100, 'a'), '{'.repeat(60) + '}'.repeat(10), '}'.repeat(30) + '{a,b}'
];
let seed = 0x5eed;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ALPHABET = ['{', '}', ',', '.', '..', 'a', 'b', '1', '9', '-', '\\', '$', '(', ')', '[', ']', '"', "'", '|', '/', '*'];
const fuzz = [];
for (let i = 0; i < 20000; i++) {
  let s = '';
  const len = 1 + Math.floor(rand() * 24);
  for (let j = 0; j < len; j++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  fuzz.push(s);
}
let compared = 0;
const mismatches = [];
for (const pattern of [...CURATED, ...fuzz]) {
  for (const options of OPTION_SETS) {
    for (const [name, run] of Object.entries(MODES)) {
      if (name === 'parse') continue;
      const want = outcome(() => run(reference, pattern, options));
      const got = outcome(() => run(patched, pattern, options));
      compared++;
      if (want !== got && mismatches.length < 10)
        mismatches.push(`${name}(${JSON.stringify(pattern)}, ${JSON.stringify(options)}): 3.0.3=${want} patched=${got}`);
    }
  }
}
check(`differential compatibility with published 3.0.3 (${compared} comparisons)`, () => {
  assert.deepEqual(mismatches, []);
});
check('escapeInvalid matches published 3.0.3 on representative cases', () => {
  for (const p of ['{{a}}', '{a}', 'a/{b}/c', '{a,{b}}', '{{a,b}', '{a,b}}', '{a,b}{', '}{a,b}', '\\{a,b}', '{{a,b},c}'])
    for (const fn of ['compile', 'stringify', 'expand'])
      assert.equal(
        outcome(() => patched[fn](p, { escapeInvalid: true })),
        outcome(() => reference[fn](p, { escapeInvalid: true })),
        `${fn}(${p})`
      );
  assert.equal(patched.stringify('{{a}}', { escapeInvalid: true }), '{{a}}');
});

console.log(`liquorify verification: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
