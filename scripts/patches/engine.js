'use strict';
// engine.js — apply patch descriptors to the extracted app, emit a report.
const fs = require('fs');
const path = require('path');
const { collectDescriptors } = require('./registry');
const { findMainBundle } = require('./shared');

function resolveTarget(extractedDir, desc) {
  if (desc.file) return path.join(extractedDir, desc.file);
  switch (desc.phase) {
    case 'main-bundle': return findMainBundle(extractedDir);
    case 'extracted-app': return path.join(extractedDir, 'package.json');
    default: return null;
  }
}

function applyPatches(extractedDir, opts) {
  opts = opts || {};
  const root = path.join(__dirname, 'core');
  const descriptors = collectDescriptors(root);
  const report = {
    extractedDir,
    total: descriptors.length,
    applied: 0, skipped: 0, failed: 0,
    patches: [],
  };

  for (const desc of descriptors) {
    const entry = {
      id: desc.id, phase: desc.phase, ciPolicy: desc.ciPolicy,
      file: desc._file, status: 'pending',
    };
    if (desc._loadError) {
      entry.status = 'failed'; entry.reason = 'load error: ' + desc._loadError;
      report.failed++; report.patches.push(entry); continue;
    }
    try {
      const target = resolveTarget(extractedDir, desc);
      if (!target || !fs.existsSync(target)) {
        entry.status = 'skipped'; entry.reason = 'target not found';
        report.skipped++;
      } else {
        const source = fs.readFileSync(target, 'utf8');
        const result = desc.apply(source, { extractedDir, target });
        if (typeof result === 'string' && result !== source) {
          fs.writeFileSync(target, result);
          entry.status = 'applied'; entry.target = path.relative(extractedDir, target);
          report.applied++;
        } else {
          entry.status = 'skipped'; entry.reason = 'no change'; entry.target = path.relative(extractedDir, target);
          report.skipped++;
        }
      }
    } catch (e) {
      entry.status = 'failed'; entry.reason = e.message;
      report.failed++;
      if (desc.ciPolicy === 'required-upstream' && opts.enforce) {
        report.patches.push(entry);
        const err = new Error('required-upstream patch failed: ' + desc.id + ' — ' + e.message);
        err.report = report;
        throw err;
      }
    }
    report.patches.push(entry);
  }
  return report;
}

module.exports = { applyPatches, resolveTarget };
