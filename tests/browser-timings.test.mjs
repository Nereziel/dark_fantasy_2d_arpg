import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../.github/actions/browser-timings.mjs', import.meta.url));
test('browser timings count failed attempts and order nested tests by total execution time', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arpg-timings-'));
  try {
    const report = join(dir, 'report.json');
    const summary = join(dir, 'summary.md');
    writeFileSync(report, JSON.stringify({
      stats: { duration: 12345 },
      suites: [{ title: 'outer', suites: [{ title: 'nested', specs: [
        { title: 'fast', file: 'fast.spec.ts', tests: [{ status: 'expected', results: [{ duration: 100 }] }] },
        { title: 'retried | test', file: 'slow.spec.ts', tests: [
          { status: 'flaky', results: [{ duration: 30000 }, { duration: 2000 }] }
        ] }
      ] }] }]
    }));
    const output = execFileSync(process.execPath, [script, report, 'quick-1'], {
      encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summary }
    });
    assert.match(output, /Tests: 2; retried: 1; retry execution: 2\.0 s; reporter wall time: 12\.3 s/);
    assert.ok(output.indexOf('slow.spec.ts') < output.indexOf('fast.spec.ts'));
    assert.ok(output.includes('32.0 s | 2 | flaky'));
    assert.equal(readFileSync(summary, 'utf8').trim(), output.trim());
    const absent = execFileSync(process.execPath, [script, join(dir, 'absent.json')], { encoding: 'utf8' });
    assert.match(absent, /No browser JSON report/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('browser diagnostics include every failed test and attempt, and missing reports reach job summary', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arpg-diagnostics-'));
  try {
    const report = join(dir, 'report.json');
    const summary = join(dir, 'summary.md');
    const specs = Array.from({length: 13}, (_, i) => ({
      title: 'slow pass ' + i, file: 'pass.spec.ts',
      tests: [{status: 'expected', results: [{duration: 1000}]}]
    }));
    specs.push({title: 'fast failure', file: 'failure.spec.ts', tests: [{
      status: 'unexpected', results: [{duration: 2, status: 'failed', errors: [{message: 'Expected 4, received 5'}]},
        {duration: 3, status: 'timedOut', errors: [{message: 'Tap intercepted'}]}]
    }]});
    writeFileSync(report, JSON.stringify({suites: [{specs}], errors: [{message: 'Global setup error'}]}));
    const env = {...process.env, GITHUB_STEP_SUMMARY: summary};
    const out = execFileSync(process.execPath, [script, report, 'quick-2'], {encoding: 'utf8', env});
    assert.match(out, /unexpected: 1/);
    assert.match(out, /fast failure/);
    assert.match(out, /Expected 4, received 5/);
    assert.match(out, /Tap intercepted/);
    assert.match(out, /Global setup error/);
    execFileSync(process.execPath, [script, join(dir, 'absent.json'), 'act-i'], {encoding: 'utf8', env});
    assert.match(readFileSync(summary, 'utf8'), /No browser JSON report/);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
