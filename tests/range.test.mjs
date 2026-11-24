import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShared, readKlines, close } from './helpers.mjs';

const S = loadShared();
const k5 = readKlines(['11', '12', '13'].map(d => `BTCUSDT-5m-2026-11-${d}.csv`));

test('New York time slots follow daylight saving and weekends', () => {
  // US stock open 09:30 New York = 13:30 UTC in summer, 14:30 UTC in winter → same slot (19)
  assert.equal(S.nySlot(Date.parse('2026-07-01T13:30:00Z')), 19);
  assert.equal(S.nySlot(Date.parse('2026-01-14T14:30:00Z')), 19);
  assert.equal(S.nySlot(Date.parse('2026-11-14T15:00:00Z')), 20 + 48);          // Saturday 10:00
  assert.equal(S.nySlot(Date.parse('2026-11-01T05:30:00Z')), 3 + 48);           // 01:30 EDT (Sunday, before the change)
  assert.equal(S.nySlot(Date.parse('2026-11-01T06:30:00Z')), 3 + 48);           // 01:30 EST (after the change)
});

test('rangeAt equals an independent recomputation of the model', () => {
  let checked = 0;
  for (let i = 300; i < k5.c.length; i += 41) for (const m of [15, 60]) {
    const M = S.RANGE[m], rr = j => Math.log(k5.h[j] / k5.l[j]);
    const avg = n => { let s = 0; for (let j = i - n + 1; j <= i; j++) s += rr(j); return s / n; };
    const start = k5.t[i] + 3e5;
    const z = M.b[0] + M.b[1] * Math.log(avg(12)) + M.b[2] * Math.log(avg(48)) + M.b[3] * Math.log(avg(288)) + M.tod[S.nySlot(start + m * 3e4)];
    assert.ok(close(S.rangeAt(k5, i, m), M.K * Math.exp(z), 1e-12), `i=${i} m=${m}`);
    checked++;
  }
  assert.ok(checked >= 20);
});

test('rangeAt refuses short or broken history instead of guessing', () => {
  assert.equal(S.rangeAt(k5, 200, 15), null);                                   // less than 24h of candles
  const gap = { t: k5.t.slice(), h: k5.h, l: k5.l };
  gap.t.splice(100, 1);                                                          // one missing candle inside the 24h window
  assert.equal(S.rangeAt({ t: gap.t, h: gap.h.slice(0, gap.t.length), l: gap.l.slice(0, gap.t.length) }, 380, 15), null);
  assert.equal(S.rangeAt(k5, 400, 30), null);                                    // only 15 and 60 minutes exist
});

test('on real BTC candles the band holds most of the time (sanity, not the full test)', () => {
  for (const m of [15, 60]) {
    const H = m / 5; let n = 0, ok = 0;
    for (let i = 287; i + H < k5.c.length; i++) {
      const h = S.rangeAt(k5, i, m); if (h == null) continue;
      const c = k5.c[i]; let hi = -Infinity, lo = Infinity;
      for (let q = i + 1; q <= i + H; q++) { hi = Math.max(hi, k5.h[q]); lo = Math.min(lo, k5.l[q]); }
      n++; ok += hi <= c * Math.exp(h) && lo >= c * Math.exp(-h);
    }
    assert.ok(n > 400, 'enough forecasts');
    assert.ok(ok / n > 0.6 && ok / n < 0.97, `${m} min coverage ${(ok / n * 100).toFixed(1)}%`);
  }
});
