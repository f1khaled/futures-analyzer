// Loads code straight out of index.html so the tests exercise exactly what the site runs.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
export const FIX = path.join(ROOT, 'tests', 'fixtures');

/** The pure SHARED block (indicators + situation detection). */
export function loadShared() {
  const code = HTML.slice(HTML.indexOf('/* SHARED:BEGIN'), HTML.indexOf('/* SHARED:END */'));
  const ctx = vm.createContext({ Math, Number, Array, Float64Array, Infinity, NaN });
  vm.runInContext(code + '\n;globalThis.__S = SHARED;', ctx);
  return ctx.__S;
}

/** Extracts a top-level `function name(...) {...}` (brace matching) plus optional constant lines. */
export function loadFunctions(names, consts = []) {
  let src = '';
  for (const c of consts) { const m = HTML.match(new RegExp(`^const ${c} = .*;$`, 'm')); if (!m) throw new Error('const not found: ' + c); src += m[0] + '\n'; }
  for (const name of names) {
    const start = HTML.indexOf(`function ${name}(`); if (start < 0) throw new Error('function not found: ' + name);
    let i = HTML.indexOf('{', start), depth = 0;
    for (; i < HTML.length; i++) { if (HTML[i] === '{') depth++; else if (HTML[i] === '}' && --depth === 0) break; }
    src += HTML.slice(start, i + 1) + '\n';
  }
  const ctx = vm.createContext({ URL, decodeURIComponent });   // browser built-ins the page relies on
  vm.runInContext(src + `\n;globalThis.__F = { ${names.join(', ')} };`, ctx);
  return ctx.__F;
}

/** Binance archive kline CSVs → arrays (closed candles). */
export function readKlines(files) {
  const rows = new Map();
  for (const f of files) for (const line of fs.readFileSync(path.join(FIX, f), 'utf8').split('\n')) {
    const a = line.split(','); if (/^\d+$/.test(a[0])) rows.set(+a[0], a);
  }
  const k = { t: [], o: [], h: [], l: [], c: [], v: [], qv: [], tb: [], ct: [] };
  for (const a of [...rows.values()].sort((x, y) => x[0] - y[0])) {
    k.t.push(+a[0]); k.o.push(+a[1]); k.h.push(+a[2]); k.l.push(+a[3]); k.c.push(+a[4]); k.v.push(+a[5]); k.ct.push(+a[6]); k.qv.push(+a[7]); k.tb.push(+a[9]);
  }
  return k;
}

/** Binance archive metrics CSVs → { oi, gls, tpos } series of {t, v}. */
export function readMetrics(files) {
  const oi = [], gls = [], tpos = [];
  for (const f of files) for (const line of fs.readFileSync(path.join(FIX, f), 'utf8').split('\n')) {
    const a = line.split(','); if (a.length < 8 || !/^\d{4}-/.test(a[0])) continue;
    const t = Date.parse(a[0].replace(' ', 'T') + 'Z');
    oi.push({ t, v: +a[2] }); gls.push({ t, v: +a[6] }); tpos.push({ t, v: +a[5] });
  }
  for (const s of [oi, gls, tpos]) s.sort((x, y) => x.t - y.t);
  return { oi, gls, tpos };
}

// ---- independent reference implementations (deliberately written differently from index.html) ----
export function refEma(values, n) {
  const out = values.map(() => NaN); if (values.length < n) return out;
  let prev = values.slice(0, n).reduce((a, b) => a + b, 0) / n; out[n - 1] = prev;
  for (let i = n; i < values.length; i++) { prev += (2 / (n + 1)) * (values[i] - prev); out[i] = prev; }
  return out;
}
export function refRsi(closes, n) {
  const out = closes.map(() => NaN); if (closes.length <= n) return out;
  const ch = closes.slice(1).map((c, i) => c - closes[i]);
  let g = ch.slice(0, n).reduce((a, d) => a + Math.max(d, 0), 0) / n, l = ch.slice(0, n).reduce((a, d) => a + Math.max(-d, 0), 0) / n;
  const val = () => (l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l));
  out[n] = val();
  for (let i = n; i < ch.length; i++) { g = (g * (n - 1) + Math.max(ch[i], 0)) / n; l = (l * (n - 1) + Math.max(-ch[i], 0)) / n; out[i + 1] = val(); }
  return out;
}
export const close = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
