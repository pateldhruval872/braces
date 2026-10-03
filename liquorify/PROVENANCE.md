# braces 3.0.4-liquorify.0 (temporary Liquorify security build)

This branch is a temporary, Liquorify-maintained security build of
[`braces`](https://github.com/micromatch/braces). It exists only because
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
(CVE-2026-93687, `braces <= 3.0.3`) had no official patched release. It is not a
general fork and takes no other upstream development.

## Base

- Upstream tag `3.0.3`, commit `74b2db2938fad48a2ea54a9c8bf27a37a62c350d`.
- That commit is the published `braces@3.0.3` (`gitHead`), and its `index.js`,
  `lib/`, `LICENSE`, `README.md` and `package.json` are byte-identical to the
  registry tarball (`sha512-yQbXgO/OSZVD2IsiLlro+7Hf6Q18EJrKSEsdoMzKePKXct3gvD8oLcOQdIzGupr5Fj+EDe8gO/lxc1BzfMpxvA==`).
- Upstream `master` commits made after 3.0.3 (CI, Node 8.3 engine floor, the
  unpaired-quote and set-invalidity parser fixes) are deliberately **not**
  included.

## Security fix

The four code commits of upstream PR
[micromatch/braces#72](https://github.com/micromatch/braces/pull/72), reviewed at
PR head `28d440b5dd449dbf1fe6f3506cf94ecca4d02660`, are cherry-picked unchanged
(`git cherry-pick -x`, so each commit names its upstream SHA):

| Upstream commit | Purpose |
| --- | --- |
| `d0d575e55e74a4e0218e5248fafb79efc3e54ebb` | Depth limit (`MAX_DEPTH` 100, `options.maxDepth`) in the parser and in the compile, expand and stringify walkers |
| `e072fe408812dbcb428cf85fde4cfb12ec4021f0` | Restores 3.0.3 `escapeInvalid` behaviour in stringify |
| `2569eada352a032decd189db906c3c7d87be0ad0` | Enforces a fractional `maxDepth` while parsing |
| `f7ba960d37ddb452b0ad304812635b7259abb173` | Rejects cyclic AST parent chains in expand |

The PR's fifth commit, `28d440b`, only extends a Node 8.3 test shim that exists on
`master` and not on 3.0.3, so it does not apply. The resulting `lib/` change is
line-for-line identical to the PR's `lib/` change against `master`.

## Version

`3.0.4-liquorify.0` sits above the advisory's `<=3.0.3` range under npm's semver
rules (including `includePrerelease`), so `npm audit` evaluates the real version
of this build rather than an exception. The version marks patched code only.

## Verification

- `npx mocha`: the upstream suite plus the PR's tests (774 passing; 3.0.3 has 764,
  and 8 of the new tests fail against unpatched 3.0.3).
- `node liquorify/verify.js --reference <extracted npm pack braces@3.0.3>`:
  Liquorify's independent checks (original failure reproduced on 3.0.3 and
  prevented here, depth boundary, `maxDepth`, caller-supplied and cyclic ASTs,
  parent cycles, and a differential comparison against published 3.0.3 for
  nesting up to 100).

`package.json` `files` still publishes only `index.js` and `lib/`, so the
`liquorify/` directory never reaches an installed copy.

## Removal

When an official upstream `braces` release resolves GHSA-vfj7-8cjw-p6xm and passes
Liquorify verification, Liquorify replaces this build with that release and
removes its override. This build then stops being maintained.

## License

MIT, unchanged. See `LICENSE` (Copyright (c) 2014-present, Jon Schlinkert).
