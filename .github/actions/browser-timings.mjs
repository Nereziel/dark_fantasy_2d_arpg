// GPL-3.0-only. Read Playwright's JSON report, including retry attempts.
import { existsSync, readFileSync, appendFileSync } from 'node:fs';

const [path, lane = 'browser'] = process.argv.slice(2);
if (!path || !existsSync(path)) {
  console.log('No browser JSON report (setup failure, cancellation, or crash).');
  process.exit(0);
}
const report = JSON.parse(readFileSync(path, 'utf8'));
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
const lines = [
  '## Browser timings — ' + lane,
  '',
  'Tests: ' + rows.length + '; retried: ' + retried.length
    + '; retry execution: ' + sec(rows.reduce((n, row) => n + row.retryMs, 0))
    + '; reporter wall time: ' + sec(report.stats?.duration ?? 0),
  '',
  '| Slowest test (all attempts) | Duration | Attempts | Outcome |',
  '|---|---:|---:|---|',
  ...rows.slice(0, 12).map(row => '| ' + escape(row.file + ' — ' + row.title)
    + ' | ' + sec(row.ms) + ' | ' + row.attempts + ' | ' + escape(row.status) + ' |')
];
const output = lines.join('\n') + '\n';
console.log(output);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, output);
