#!/usr/bin/env node
'use strict';
// apply.js — entry point: run all core/ patch descriptors over an extracted app.
const fs = require('fs');
const { applyPatches } = require('./engine');

const argv = process.argv.slice(2);
let extractedDir = null;
let reportPath = 'patch-report.json';
let enforce = false;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--report-json') reportPath = argv[++i];
  else if (a === '--enforce-critical') enforce = true;
  else if (a === '-h' || a === '--help') {
    console.error('usage: apply.js [--report-json PATH] [--enforce-critical] <app-extracted>');
    process.exit(0);
  } else if (!a.startsWith('-') && !extractedDir) extractedDir = a;
}

if (!extractedDir) {
  console.error('apply.js: missing <app-extracted> argument');
  process.exit(2);
}

let report;
try {
  report = applyPatches(extractedDir, { enforce });
} catch (e) {
  if (e.report) {
    fs.writeFileSync(reportPath, JSON.stringify(e.report, null, 2));
    console.error('[patches] FAILED (enforced): ' + e.message);
    process.exit(1);
  }
  throw e;
}

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.error('[patches] total=' + report.total + ' applied=' + report.applied + ' skipped=' + report.skipped + ' failed=' + report.failed);
if (report.failed > 0 && enforce) process.exit(1);
