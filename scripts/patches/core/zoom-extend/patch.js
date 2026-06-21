'use strict';
// zoom-extend — widen ZCode's interface zoom range and presets.
//
// Stock ZCode clamps the Electron zoomLevel to [-0.5, 0.5] (≈90%–111%) and
// exposes only 3 presets (small / default / large). This patch widens the
// range to [-5, 5] (≈40%–249%, 0.5 step unchanged) and grows the settings UI
// to 5 evenly-spaced presets by adding xsmall / xlarge with matching i18n.
//
// Upstream minified variable names change between releases. The needles below
// are grouped by upstream version so the patch keeps working across bumps; a
// diagnostic log line records which variant matched (or none) so a future
// upstream change is obvious from the patch report / stderr.
//
// Implementation note: the patch engine applies one descriptor per target
// file and reports applied/skipped on it. We target the Electron main bundle
// (out/main/index.js, resolved via shared.findMainBundle) and do the
// main-bundle edit through the normal return-value path; the preload, the
// renderer index bundle, and the i18n bundle are edited directly via fs in
// the same apply() call so a single make-bootstrap run patches everything.
// The renderer asset filenames are content-hashed, so they are resolved at
// apply time rather than hard-coded.
const fs = require('fs');
const path = require('path');

const { replaceAll } = require('../../shared');

// Apply all needle→replacement pairs to `source`. Each pair is independent;
// a missing needle (already patched or different upstream) is silently
// skipped for that pair. Returns the new string if any pair matched, else
// the original (caller can detect "no change"). `log` collects which pairs
// matched for diagnostics.
function applyAll(source, pairs, log) {
  let out = source;
  let changed = false;
  for (const [needle, repl] of pairs) {
    if (typeof needle !== 'string' || needle.length === 0) continue;
    if (out.indexOf(needle) === -1) continue; // not present → skip pair
    out = replaceAll(out, needle, repl);
    changed = true;
    if (log) log.push(needle.slice(0, 40));
  }
  return changed ? out : source;
}

// Resolve the single asset whose filename starts with `prefix` under
// out/renderer/assets. Returns absolute path or null (none/ambiguous).
function findAsset(extractedDir, prefix) {
  const dir = path.join(extractedDir, 'out', 'renderer', 'assets');
  if (!fs.existsSync(dir)) return null;
  const hits = fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.js'));
  return hits.length === 1 ? path.join(dir, hits[0]) : null;
}

// Edit a file in place with the given pairs; return true if it changed.
function patchFile(filePath, pairs, log) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  const before = fs.readFileSync(filePath, 'utf8');
  const after = applyAll(before, pairs, log);
  if (after !== before) {
    fs.writeFileSync(filePath, after);
    return true;
  }
  return false;
}

// Target zoom range applied to every clamp below.
const ZOOM_MIN = '-5';
const ZOOM_MAX = '5';

// main-bundle clamp variants across upstream releases.
//   3.0.x:  pC=.5,$N=-.5,NN=.5   (step, floor, ceil inline)
//   3.1.x:  QC=.5,FL=-.5,WL=.5   (named consts: step, floor, ceil)
const MAIN_PAIRS = [
  ['QC=.5,FL=-.5,WL=.5', `QC=.5,FL=${ZOOM_MIN},WL=${ZOOM_MAX}`], // 3.1.x
  ['pC=.5,$N=-.5,NN=.5', `pC=.5,$N=${ZOOM_MIN},NN=${ZOOM_MAX}`], // 3.0.x
];

// preload clamp variants across upstream releases.
//   3.0.x:  zS=-.5,ES=.5
//   3.1.x:  Bk=-.5,Fk=.5
const PRELOAD_PAIRS = [
  ['Bk=-.5,Fk=.5', `Bk=${ZOOM_MIN},Fk=${ZOOM_MAX}`], // 3.1.x
  ['zS=-.5,ES=.5', `zS=${ZOOM_MIN},ES=${ZOOM_MAX}`], // 3.0.x
];

// 3-preset → 5-preset array variants across upstream releases. The preset
// array variable name changed (U6 → l8); both are handled. The rest of the
// literal is byte-identical upstream, so one replacement per variant.
const SMALL_DEFAULT_LARGE =
  '[{id:`small`,zoomLevel:-.5},{id:`default`,zoomLevel:0},{id:`large`,zoomLevel:.5}]';
const PRESET_PAIRS = [
  [`l8=${SMALL_DEFAULT_LARGE}`, // 3.1.x
    'l8=[{id:`xsmall`,zoomLevel:-5},{id:`small`,zoomLevel:-2.5},{id:`default`,zoomLevel:0},{id:`large`,zoomLevel:2.5},{id:`xlarge`,zoomLevel:5}]'],
  [`U6=${SMALL_DEFAULT_LARGE}`, // 3.0.x
    'U6=[{id:`xsmall`,zoomLevel:-5},{id:`small`,zoomLevel:-2.5},{id:`default`,zoomLevel:0},{id:`large`,zoomLevel:2.5},{id:`xlarge`,zoomLevel:5}]'],
];

// preset array index references that must point at the FIRST and LAST element
// once the array grows from 3→5 entries. Both the lower and upper bounds are
// derived from array slots upstream, so growing the array shifts them.
//   3.0.x:  YSt=U6[2].zoomLevel                 (only upper)
//   3.1.x:  Owt=l8[0].zoomLevel,kwt=l8[2].zoomLevel   (lower + upper)
// Rewriting both slot indices to length-relative keeps the bounds correct
// regardless of array size.
const INDEX_PAIRS = [
  ['Owt=l8[0].zoomLevel,kwt=l8[2].zoomLevel', 'Owt=l8[0].zoomLevel,kwt=l8[l8.length-1].zoomLevel'], // 3.1.x
  ['YSt=U6[2].zoomLevel', 'YSt=U6[U6.length-1].zoomLevel'], // 3.0.x
];

// i18n: add xsmall/xlarge labels for en and zh (app ships en/zh only). The
// option strings are byte-identical across releases, so no version split.
const I18N_PAIRS = [
  [
    '"settings.zoomLevel.option.small":`Smaller`,"settings.zoomLevel.option.default":`Default`,"settings.zoomLevel.option.large":`Larger`',
    '"settings.zoomLevel.option.small":`Smaller`,"settings.zoomLevel.option.default":`Default`,"settings.zoomLevel.option.large":`Larger`,"settings.zoomLevel.option.xsmall":`Tiny`,"settings.zoomLevel.option.xlarge":`Huge`',
  ],
  [
    '"settings.zoomLevel.option.small":`偏小`,"settings.zoomLevel.option.default":`正常`,"settings.zoomLevel.option.large":`偏大`',
    '"settings.zoomLevel.option.small":`偏小`,"settings.zoomLevel.option.default":`正常`,"settings.zoomLevel.option.large":`偏大`,"settings.zoomLevel.option.xsmall":`极小`,"settings.zoomLevel.option.xlarge":`极大`',
  ],
];

module.exports = {
  id: 'zoom-extend',
  phase: 'main-bundle', // target = out/main/index.js (engine marks applied/skipped on it)
  order: 50,
  ciPolicy: 'optional',
  apply: (source, ctx) => {
    const root = ctx.extractedDir;
    const log = [];

    // (2) preload clamp.
    patchFile(path.join(root, 'out', 'preload', 'index.cjs'), PRELOAD_PAIRS, log);

    // (3) renderer index bundle: 3-preset → 5-preset + bound index fixups.
    patchFile(findAsset(root, 'index-'), [...PRESET_PAIRS, ...INDEX_PAIRS], log);

    // (4) i18n: add xsmall/xlarge labels (en + zh).
    patchFile(findAsset(root, 'usageStatsUiParts-'), I18N_PAIRS, log);

    // (1) main bundle (the declared target). Returned via the normal path so
    //     the engine records applied/skipped for the main bundle. If every
    //     needle across all four files no-op'd (already patched, or upstream
    //     renamed the minified vars again), the whole patch is skipped and
    //     the diagnostic below helps pinpoint which file drifted.
    const out = applyAll(source, MAIN_PAIRS, log);
    if (log.length === 0) {
      process.stderr.write(
        '[zoom-extend] WARNING: no needle matched in any file — upstream ' +
        'minified names may have changed again. Inspect the extracted bundle ' +
        'and add the new needle variants to patch.js.\n'
      );
    }
    return out;
  },
};
