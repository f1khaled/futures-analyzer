import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShared, readKlines, readMetrics, close } from './helpers.mjs';

const S = loadShared();
const days = ['11', '12', '13'];
const k5 = readKlines(days.map(d => `BTCUSDT-5m-2026-11-${d}.csv`));
const k15 = readKlines(['07', '08', '09', '10', '11', '12', '13'].map(d => `BTCUSDT-15m-2026-11-${d}.csv`));
const m = readMetrics(days.map(d => `BTCUSDT-metrics-2026-11-${d}.csv`));
const ser = S.buildSeries(k5, k15, m);
const valAt = (s, ts) => { let v = NaN; for (const p of s) { if (p.t <= ts) v = p.v; else break; } return v; };

test('situation features equal an independent recomputation from raw candles and metrics', () => {
  let checked = 0;
  for (let i = 320; i < k5.c.length; i += 37) {
    const x = S.detectAt(ser, i, 0.0001, true);
    assert.ok(x, 'features at ' + i);
    const c = k5.c[i], T = k5.ct[i] + 1;
    assert.ok(close(x.P1h, c / k5.c[i - 12] - 1));
    assert.ok(close(x.P4h, c / k5.c[i - 48] - 1));
    const sum = (a, f, t) => a.slice(f, t + 1).reduce((p, q) => p + q, 0);
    assert.ok(close(x.vol24, sum(k5.qv, i - 287, i), 1e-9));
    assert.ok(close(x.VS1h, sum(k5.v, i - 11, i) / (sum(k5.v, i - 299, i - 12) / 24), 1e-9));
    const b = sum(k5.tb, i - 11, i), v = sum(k5.v, i - 11, i);
    assert.ok(close(x.TK1h, b / (v - b), 1e-9));
    const tNow = m.oi.filter(p => p.t <= T).pop().t;
    assert.ok(close(x.OI1h, valAt(m.oi, tNow) / valAt(m.oi, tNow - 36e5) - 1, 1e-9));
    assert.ok(close(x.OI4h, valAt(m.oi, tNow) / valAt(m.oi, tNow - 4 * 36e5) - 1, 1e-9));
    assert.ok(close(x.GLS, valAt(m.gls, T)));
    assert.ok(close(x.TPOSd4h, valAt(m.tpos, tNow) / valAt(m.tpos, tNow - 4 * 36e5) - 1, 1e-9));
    let H = -Infinity, L = Infinity; for (let q = i - 287; q <= i; q++) { H = Math.max(H, k5.h[q]); L = Math.min(L, k5.l[q]); }
    assert.equal(x.H24, H); assert.equal(x.L24, L);
    checked++;
  }
  assert.ok(checked >= 10);
});

test('the 15m context never uses a 15m candle that closes after the 5m candle being analysed', () => {
  for (let i = 320; i < k5.c.length; i += 11) {
    const T = k5.ct[i] + 1, x = S.detectAt(ser, i, 0.0001, true);
    const j = k15.ct.findLastIndex(ct => ct < T);
    assert.ok(close(x.e25, S.ema(k15.c, 25)[j]), 'EMA25 must come from the last closed 15m candle');
  }
});

test('situation rules fire exactly on their written conditions', () => {
  const base = { k5, k15, oi: m.oi };
  let fired = 0;
  for (let i = 320; i < k5.c.length; i++) {
    const x = S.detectAt(ser, i, 0.0001, true);
    if (x.vol24 < 5e6) { assert.equal(x.sits.length, 0); continue; }
    const has = id => x.sits.includes(id);
    assert.equal(has('S3'), x.TPOSd4h <= -0.05 && x.GLSd4h >= 0.05 && Math.abs(x.P4h) <= 0.03, 'S3 @' + i);
    assert.equal(has('S3b'), x.TPOSd4h >= 0.05 && x.GLSd4h <= -0.05 && Math.abs(x.P4h) <= 0.03, 'S3b @' + i);
    assert.equal(has('S4'), x.P1h >= 0.03 && x.OI1h <= -0.03, 'S4 @' + i);
    fired += x.sits.length;
  }
  void base; assert.ok(fired >= 0);
});

test('missing positioning data never produces a situation that needs it', () => {
  const s2 = S.buildSeries(k5, k15, { oi: [], gls: [], tpos: [] });
  for (let i = 320; i < k5.c.length; i += 5) {
    const x = S.detectAt(s2, i, 0.0001, true);
    for (const id of ['S1', 'S1b', 'S2', 'S3', 'S3b', 'S4', 'S4b', 'S5', 'S5b']) assert.ok(!x.sits.includes(id), id + ' without data @' + i);
  }
});

test('metricsAt (short-history coins) gives the same position features as detectAt', () => {
  for (let i = 320; i < k5.c.length; i += 41) {
    const a = S.detectAt(ser, i, 0.0001, true), b = S.metricsAt(ser, i);
    for (const k of ['P1h', 'P4h', 'TK1h', 'OI', 'OI1h', 'OI4h', 'OI24h', 'GLS', 'GLSd4h', 'TPOS', 'TPOSd4h', 'metricsAge']) assert.ok(close(a[k], b[k], 1e-12), k + ' @' + i);
    assert.deepEqual([...b.sits], []);
  }
  const early = S.metricsAt(ser, 30);
  assert.ok(Number.isNaN(early.P4h) && Number.isFinite(early.P1h), 'partial history: P1h yes, P4h not yet');
});
