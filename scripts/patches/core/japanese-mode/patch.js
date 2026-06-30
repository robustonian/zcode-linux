'use strict';
// japanese-mode — optional Japanese display translation for assistant output.
//
// This patch keeps model traffic and stored conversation data untouched. It
// injects a renderer-side display layer that translates visible assistant text
// through an opt-in localhost sidecar, while skipping code/diff/tool-like UI.
const fs = require('fs');
const path = require('path');

const PRELOAD_NEEDLE = 'y.contextBridge.exposeInMainWorld("zcode",{connectRemote:';
const PRELOAD_REPLACEMENT =
  'y.contextBridge.exposeInMainWorld("zcode",{japaneseModeConfig:c(()=>({enabled:/^(1|true|yes|on)$/i.test(process.env.ZCODE_JA_MODE||""),endpoint:process.env.ZCODE_JA_TRANSLATE_ENDPOINT||"",allowRemote:/^(1|true|yes|on)$/i.test(process.env.ZCODE_JA_TRANSLATE_ALLOW_REMOTE||""),timeoutMs:Number.parseInt(process.env.ZCODE_JA_TRANSLATE_TIMEOUT_MS||"",10)||12000,debug:/^(1|true|yes|on)$/i.test(process.env.ZCODE_JA_TRANSLATE_DEBUG||"")}),"japaneseModeConfig"),connectRemote:';
const OVERLAY_MARKER = '__zcodeJapaneseDisplayOverlayInstalled';

function findRendererIndex(extractedDir) {
  const dir = path.join(extractedDir, 'out', 'renderer', 'assets');
  if (!fs.existsSync(dir)) return null;
  const hits = fs.readdirSync(dir).filter((file) => /^index-[^/]+\.js$/.test(file));
  return hits.length === 1 ? path.join(dir, hits[0]) : null;
}

function patchRenderer(extractedDir) {
  const target = findRendererIndex(extractedDir);
  if (!target) {
    process.stderr.write('[japanese-mode] WARNING: renderer index bundle not found or ambiguous.\n');
    return false;
  }

  const before = fs.readFileSync(target, 'utf8');
  if (before.includes(OVERLAY_MARKER)) return false;

  const overlayPath = path.join(__dirname, 'injected', 'japanese-display-overlay.js');
  const overlay = fs.readFileSync(overlayPath, 'utf8').trim();
  fs.writeFileSync(target, `${before}\n\n${overlay}\n`);
  return true;
}

module.exports = {
  id: 'japanese-mode',
  phase: 'renderer',
  order: 60,
  ciPolicy: 'optional',
  file: 'out/preload/index.cjs',
  apply: (source, ctx) => {
    const rendererChanged = patchRenderer(ctx.extractedDir);
    if (source.includes('japaneseModeConfig')) return source;
    if (!source.includes(PRELOAD_NEEDLE)) {
      process.stderr.write('[japanese-mode] WARNING: preload exposeInMainWorld needle not found.\n');
      return rendererChanged ? `${source}\n` : source;
    }
    return source.split(PRELOAD_NEEDLE).join(PRELOAD_REPLACEMENT);
  },
};
