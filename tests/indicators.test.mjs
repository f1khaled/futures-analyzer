import test from 'node:test';
import assert from 'node:assert/strict';
import { loadShared, readKlines, refEma, refRsi, close } from './helpers.mjs';

const S = loadShared();
const k15 = readKlines(['07', '08', '09', '10', '11', '12', '13'].map(d => `BTCUSDT-15m-2026-11-${d}.csv`));

test('RSI matches Wilder\'s textbook example (StockCharts, RSI 14) within 0.1', () => {
  const c = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13];
  const book = [70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87, 45.46, 37.30, 33.08, 37.77];
  S.rsi(c, 14).slice(14).forEach((v, i) => assert.ok(Math.abs(v - book[i]) < 0.1, `day ${i + 15}: ${v.toFixed(2)} vs ${book[i]}`));
});

test('EMA 7/25/99 equal an independent implementation on real BTCUSDT 15m data', () => {
  for (const n of [7, 25, 99]) {
    const a = S.ema(k15.c, n), b = refEma(k15.c, n);
    for (let i = n - 1; i < a.length; i++) assert.ok(close(a[i], b[i]), `EMA${n} @${i}: ${a[i]} vs ${b[i]}`);
  }
});

test('RSI 6/12/24 equal an independent implementation on real BTCUSDT 15m data', () => {
  for (const n of [6, 12, 24]) {
    const a = S.rsi(k15.c, n), b = refRsi(k15.c, n);
    for (let i = n; i < a.length; i++) assert.ok(close(a[i], b[i], 1e-9), `RSI${n} @${i}: ${a[i]} vs ${b[i]}`);
  }
});

test('RSI stays within 0..100 and EMA within the price range', () => {
  const lo = Math.min(...k15.l), hi = Math.max(...k15.h);
  for (const n of [6, 12, 24]) for (const v of S.rsi(k15.c, n)) if (!Number.isNaN(v)) assert.ok(v >= 0 && v <= 100);
  for (const n of [7, 25, 99]) for (const v of S.ema(k15.c, n)) if (!Number.isNaN(v)) assert.ok(v >= lo && v <= hi);
});

test('ATR equals true-range Wilder smoothing computed independently', () => {
  const a = S.atr(k15.h, k15.l, k15.c, 14);
  const tr = k15.c.map((c, i) => i === 0 ? 0 : Math.max(k15.h[i] - k15.l[i], Math.abs(k15.h[i] - k15.c[i - 1]), Math.abs(k15.l[i] - k15.c[i - 1])));
  let x = tr.slice(1, 15).reduce((p, q) => p + q, 0) / 14;
  assert.ok(close(a[14], x));
  for (let i = 15; i < tr.length; i++) { x = x + (tr[i] - x) / 14; assert.ok(close(a[i], x), `ATR @${i}`); }
});

test('volume moving average is a plain average', () => {
  const m = S.sma(k15.v, 5);
  for (let i = 4; i < m.length; i++) assert.ok(close(m[i], (k15.v[i] + k15.v[i - 1] + k15.v[i - 2] + k15.v[i - 3] + k15.v[i - 4]) / 5));
});
