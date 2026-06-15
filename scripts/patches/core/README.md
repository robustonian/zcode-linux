# ZCode asar patches

Each patch is a `patch.js` descriptor placed under a subdirectory of `core/`.
The engine (`scripts/patches/apply.js`) collects every descriptor and applies
it to the extracted `app.asar` tree before repacking.

## Descriptor shape

```js
module.exports = [{
  id: 'linux-titlebar',        // unique id
  phase: 'main-bundle',        // 'main-bundle' | 'extracted-app' | 'renderer'
  order: 50,                   // lower runs first (default 100)
  ciPolicy: 'optional',        // 'required-upstream' | 'optional' | 'opt-in'
  file: null,                  // explicit target (relative to asar root); else auto
  apply: (source, ctx) => {    // return modified string (or same string to skip)
    return source.replace(/.../, '...');
  },
}];
```

### Phases
- `main-bundle` — targets `out/main/index.js` (ZCode's Electron main bundle)
- `extracted-app` — targets a file at the asar root (default: `package.json`)
- `renderer` — requires an explicit `file`

### ciPolicy
- `required-upstream` — failure aborts the build under `--enforce-critical`
- `optional` — failure is logged; build continues
- `opt-in` — must be explicitly enabled (not yet wired)

## Guidelines
- Match **minified** code with narrow, anchored patterns. Prefer the `replaceAll`
  helper in `shared.js` (string split/join) over `String.replace()` to avoid
  regex pitfalls.
- Add patches one per commit. Start at `ciPolicy: 'optional'`; promote to
  `required-upstream` only once stable.
- Record what changed and why in the commit message; the patch id should match.
