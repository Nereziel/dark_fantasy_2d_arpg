// GPL-3.0-only. Read Playwright's JSON report, including retry attempts.
import { existsSync, readFileSync, appendFileSync } from 'node:fs';

const [path, lane = 'browser'] = process.argv.slice(2);
function writeOutput(output) {
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, output + '\n');
}
if (!path || !existsSync(path)) {
  writeOutput('## Browser diagnostics — ' + lane + '\n\nNo browser JSON report (setup failure, cancellation, or crash).');
  process.exit(0);
}
let report;
try {
  report = JSON.parse(readFileSync(path, 'utf8'));
} catch (error) {
  writeOutput('## Browser diagnostics — ' + lane + '\n\nUnreadable browser JSON report: ' + error.message);
  process.exit(0);
}
const rows = [];
function visit(suite, parents = []) {
  const titles = [...parents, suite.title].filter(Boolean);
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const attempts = test.results ?? [];
      rows.push({
        title: [...titles, spec.title].join(' › '),
        file: spec.file ?? suite.file ?? '',
        attempts: attempts.length,
        status: test.status ?? 'unknown',
        results: attempts,
        ms: attempts.reduce((total, result) => total + Math.max(0, result.duration ?? 0), 0),
        retryMs: attempts.slice(1).reduce((total, result) => total + Math.max(0, result.duration ?? 0), 0)
      });
    }
  }
  for (const child of suite.suites ?? []) visit(child, titles);
}
for (const suite of report.suites ?? []) visit(suite);
rows.sort((a, b) => b.ms - a.ms);
const sec = ms => (ms / 1000).toFixed(1) + ' s';
const escape = value => String(value).replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');
const retried = rows.filter(row => row.attempts > 1);
const outcomes = ['expected', 'unexpected', 'flaky', 'skipped', 'unknown'];
const counts = outcomes.map(status => status + ': ' + rows.filter(row => row.status === status).length).join('; ');
const clean = value => String(value ?? '').replace(/\x1b\[[0-9;]*m/g, '').replace(/[\r\n]+/g, ' ').slice(0, 1800);
const errors = result => (result.errors?.length ? result.errors : result.error ? [result.error] : []).map(error => clean(error.message ?? error.value ?? error.stack ?? error));
const lines = [
  '## Browser timings — ' + lane,
  '',
  'Tests: ' + rows.length + '; retried: ' + retried.length
    + '; retry execution: ' + sec(rows.reduce((n, row) => n + row.retryMs, 0))
    + '; reporter wall time: ' + sec(report.stats?.duration ?? 0),
  counts,
  '',
  '| Slowest test (all attempts) | Duration | Attempts | Outcome |',
  '|---|---:|---:|---|',
  ...rows.slice(0, 12).map(row => '| ' + escape(row.file + ' — ' + row.title)
    + ' | ' + sec(row.ms) + ' | ' + row.attempts + ' | ' + escape(row.status) + ' |')
];
const problematic = rows.filter(row => row.status !== 'expected' && row.status !== 'skipped' || row.attempts > 1);
if (problematic.length) {
  lines.push('', '### Failed, retried or incomplete tests', '');
  for (const row of problematic) {
    lines.push('- **' + escape(row.file + ' — ' + row.title) + '** (' + escape(row.status) + ')');
    if (!row.results.length) lines.push('  - No attempt result was recorded.');
    for (const [index, result] of row.results.entries()) {
      lines.push('  - Attempt ' + (index + 1) + ': ' + escape(result.status ?? 'unknown') + ' — ' + sec(result.duration ?? 0));
      for (const message of errors(result)) lines.push('    - ' + escape(message));
    }
  }
}
if (report.errors?.length) {
  lines.push('', '### Global runner errors', '');
  for (const error of report.errors) lines.push('- ' + escape(clean(error.message ?? error.stack ?? error)));
}
lines.push('', 'Full JSON report is retained separately by CI when available.');
writeOutput(lines.join('\n'));
