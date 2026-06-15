'use strict';
// registry.js — collect patch descriptors from the core/ tree.
const fs = require('fs');
const path = require('path');

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function normalize(desc, file) {
  if (!desc || typeof desc.apply !== 'function') return null;
  return {
    id: desc.id || path.basename(path.dirname(file)),
    phase: desc.phase || 'extracted-app',
    order: typeof desc.order === 'number' ? desc.order : 100,
    ciPolicy: desc.ciPolicy || 'optional',
    file: desc.file || null,
    apply: desc.apply,
    _file: file,
  };
}

// Gather every <root>/**/patch.js, require it, normalize descriptors, sort by order.
function collectDescriptors(rootDir) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  for (const file of walk(rootDir)) {
    if (path.basename(file) !== 'patch.js') continue;
    try {
      delete require.cache[require.resolve(file)];
      const mod = require(file);
      const arr = Array.isArray(mod) ? mod : (Array.isArray(mod.default) ? mod.default : [mod]);
      for (const d of arr) {
        const n = normalize(d, file);
        if (n) out.push(n);
      }
    } catch (e) {
      out.push({ id: path.basename(path.dirname(file)), phase: '?', order: 999, ciPolicy: 'optional', apply: () => { throw e; }, _file: file, _loadError: e.message });
    }
  }
  out.sort((a, b) => (a.order || 100) - (b.order || 100));
  return out;
}

module.exports = { collectDescriptors, normalize };
