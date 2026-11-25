import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, FIX } from './helpers.mjs';

test('the independent Python verifier confirms a real self-test report (offline, archive fixtures)', () => {
  const r = spawnSync('python3', ['-I', path.join(ROOT, 'tools', 'verify_report.py'), path.join(FIX, 'selftest-report-BTCUSDT-2026-11-13.txt'), '--csvdir', FIX], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /RESULT: 18 matched, 0 close \(Binance API vs archive, <0\.1%\), 0 mismatched/);
});
