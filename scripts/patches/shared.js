'use strict';
// shared.js — helpers for ZCode asar patches (minified-bundle targeting).
const fs = require('fs');
const path = require('path');

// Locate the Electron main-process bundle.
// ZCode 3.x ships out/main/index.js; fall back to common Vite/webpack layouts.
function findMainBundle(extractedDir) {
  const direct = ['out/main/index.js', '.vite/build/main.js', 'dist/main.js'];
  for (const c of direct) {
    const p = path.join(extractedDir, c);
    if (fs.existsSync(p)) return p;
  }
  for (const dir of ['out/main', '.vite/build', 'dist', 'build']) {
    const d = path.join(extractedDir, dir);
    if (fs.existsSync(d) && fs.statSync(d).isDirectory()) {
      for (const f of fs.readdirSync(d)) {
        if (/^main.*\.js$/i.test(f)) return path.join(d, f);
      }
    }
  }
  return null;
}

// Replace every occurrence of `needle` in `haystack` with `replacement`.
// Prefer this over String.replace() to avoid regex pitfalls on minified code.
function replaceAll(haystack, needle, replacement) {
  if (typeof needle !== 'string' || needle.length === 0) return haystack;
  return haystack.split(needle).join(replacement);
}

module.exports = { findMainBundle, replaceAll };
