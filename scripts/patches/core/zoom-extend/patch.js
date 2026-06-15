'use strict';
// zoom-extend — widen ZCode's interface zoom range and presets.
//
// Stock ZCode clamps the Electron zoomLevel to [-0.5, 0.5] (≈90%–111%) and
// exposes only 3 presets (small / default / large). This patch widens the
// range to [-5, 5] (≈40%–249%, 0.5 step unchanged) and grows the settings UI
// to 5 evenly-spaced presets by adding xsmall / xlarge with matching i18n.
//
// Implementation note: the patch engine applies one descriptor per target
// file and reports applied/skipped per file. We target the Electron main
// bundle (out/main/index.js, resolved via shared.findMainBundle) and do the
// main-bundle edit through the normal return-value path; the preload, the
// renderer index bundle, and the i18n bundle are edited directly via fs in
// the same apply() call so a single make-bootstrap run patches everything.
// The renderer asset filenames are content-hashed, so they are resolved at
// apply time rather than hard-coded.
const fs = require('fs');
const path = require('path');

const { replaceAll } = require('../../shared');

// Apply all needle→replacement pairs to `source`. Returns the new string if any
// pair matched, otherwise the original (caller can detect "no change").
function applyAll(source, pairs) {
  let out = source;
  let changed = false;
  for (const [needle, repl] of pairs) {
    if (typeof needle !== 'string' || needle.length === 0) continue;
    if (out.indexOf(needle) === -1) continue; // not present (already patched?) → skip pair
    out = replaceAll(out, needle, repl);
    changed = true;
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
function patchFile(filePath, pairs) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  const before = fs.readFileSync(filePath, 'utf8');
  const after = applyAll(before, pairs);
  if (after !== before) {
    fs.writeFileSync(filePath, after);
    return true;
  }
  return false;
}

module.exports = {
  id: 'zoom-extend',
  phase: 'main-bundle', // target = out/main/index.js (engine marks applied/skipped on it)
  order: 50,
  ciPolicy: 'optional',
  apply: (source, ctx) => {
    const root = ctx.extractedDir;

    // (2) preload: zS=-.5,ES=.5;  →  zS=-5,ES=5;
    patchFile(path.join(root, 'out', 'preload', 'index.cjs'), [
      ['zS=-.5,ES=.5;', 'zS=-5,ES=5;'],
    ]);

    // (3) renderer index bundle: 3-preset U6 + YSt=U6[2]  →  5-preset + YSt=U6[last]
    patchFile(findAsset(root, 'index-'), [
      [
        'U6=[{id:`small`,zoomLevel:-.5},{id:`default`,zoomLevel:0},{id:`large`,zoomLevel:.5}]',
        'U6=[{id:`xsmall`,zoomLevel:-5},{id:`small`,zoomLevel:-2.5},{id:`default`,zoomLevel:0},{id:`large`,zoomLevel:2.5},{id:`xlarge`,zoomLevel:5}]',
      ],
      ['YSt=U6[2].zoomLevel', 'YSt=U6[U6.length-1].zoomLevel'],
    ]);

    // (4) i18n: add xsmall/xlarge labels for en and zh (app ships en/zh only).
    patchFile(findAsset(root, 'usageStatsUiParts-'), [
      [
        '"settings.zoomLevel.option.small":`Smaller`,"settings.zoomLevel.option.default":`Default`,"settings.zoomLevel.option.large":`Larger`',
        '"settings.zoomLevel.option.small":`Smaller`,"settings.zoomLevel.option.default":`Default`,"settings.zoomLevel.option.large":`Larger`,"settings.zoomLevel.option.xsmall":`Tiny`,"settings.zoomLevel.option.xlarge":`Huge`',
      ],
      [
        '"settings.zoomLevel.option.small":`偏小`,"settings.zoomLevel.option.default":`正常`,"settings.zoomLevel.option.large":`偏大`',
        '"settings.zoomLevel.option.small":`偏小`,"settings.zoomLevel.option.default":`正常`,"settings.zoomLevel.option.large":`偏大`,"settings.zoomLevel.option.xsmall":`极小`,"settings.zoomLevel.option.xlarge":`极大`',
      ],
    ]);

    // (1) main bundle (the declared target): pC=.5,$N=-.5,NN=.5  →  pC=.5,$N=-5,NN=5
    //     Returned via the normal path so the engine records applied/skipped
    //     for the main bundle. If the other three files all no-op'd too and
    //     this also no-ops, the whole patch is idempotently skipped.
    return applyAll(source, [
      ['pC=.5,$N=-.5,NN=.5', 'pC=.5,$N=-5,NN=5'],
    ]);
  },
};
