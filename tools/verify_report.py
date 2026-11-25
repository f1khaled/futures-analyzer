#!/usr/bin/env python3
"""
Independent verifier for the site's "فحص البيانات" (self-test) report.

It re-downloads the same data from Binance's official archive (data.binance.vision),
recomputes every indicator with its OWN implementation (written separately from
index.html), and compares number by number.

Usage:
    python3 tools/verify_report.py report.txt            # report pasted from the site
    python3 tools/verify_report.py report.txt --csvdir DIR   # use local archive CSVs instead of downloading

The archive publishes a day's files the next day (UTC), so verify a report once its day has ended.
Only the Python standard library is used.
"""
import csv, io, math, os, re, ssl, sys, urllib.request, zipfile
from datetime import datetime, timezone

BASE = "https://data.binance.vision/data/futures/um/daily"


# ---------------- independent reference implementations ----------------
def ref_ema(values, n):
    """EMA with alpha = 2/(n+1), seeded with the simple average of the first n values."""
    if len(values) < n:
        return [math.nan] * len(values)
    out = [math.nan] * (n - 1)
    prev = sum(values[:n]) / n
    out.append(prev)
    alpha = 2.0 / (n + 1)
    for v in values[n:]:
        prev = prev + alpha * (v - prev)
        out.append(prev)
    return out


def ref_rsi_wilder(closes, n):
    """Wilder RSI: averages seeded with a simple mean of the first n changes, then RMA (alpha = 1/n)."""
    out = [math.nan] * len(closes)
    if len(closes) <= n:
        return out
    changes = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(c, 0.0) for c in changes]
    losses = [max(-c, 0.0) for c in changes]
    ag, al = sum(gains[:n]) / n, sum(losses[:n]) / n

    def value(g, l):
        if l == 0:
            return 50.0 if g == 0 else 100.0
        return 100.0 - 100.0 / (1.0 + g / l)

    out[n] = value(ag, al)
    for i in range(n, len(changes)):
        ag = (ag * (n - 1) + gains[i]) / n
        al = (al * (n - 1) + losses[i]) / n
        out[i + 1] = value(ag, al)
    return out


def ref_sma(values, n):
    return [math.nan if i < n - 1 else sum(values[i - n + 1:i + 1]) / n for i in range(len(values))]


# ---------------- archive access ----------------
def fetch_zip_csv(url, csvdir=None):
    name = url.rsplit("/", 1)[1].replace(".zip", ".csv")
    if csvdir and os.path.exists(os.path.join(csvdir, name)):
        with open(os.path.join(csvdir, name), newline="") as f:
            return list(csv.reader(f))
    ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None)
    with urllib.request.urlopen(url, context=ctx, timeout=60) as r:
        data = r.read()
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        with z.open(z.namelist()[0]) as f:
            return list(csv.reader(io.TextIOWrapper(f, "utf-8")))


def day_list(end_ms, days):
    d = datetime.fromtimestamp(end_ms / 1000, tz=timezone.utc).date()
    from datetime import timedelta
    return [(d - timedelta(days=k)).isoformat() for k in range(days - 1, -1, -1)]


def load_klines(sym, tf, end_ms, days, csvdir):
    rows = {}
    for day in day_list(end_ms, days):
        try:
            for r in fetch_zip_csv(f"{BASE}/klines/{sym}/{tf}/{sym}-{tf}-{day}.zip", csvdir):
                if r and r[0].isdigit():
                    rows[int(r[0])] = r
        except Exception as e:  # missing day → reported below
            print(f"  ! could not load klines {day}: {e}")
    return [rows[k] for k in sorted(rows)]


def load_metrics(sym, end_ms, csvdir):
    out = {}
    for day in day_list(end_ms, 1):
        try:
            for r in fetch_zip_csv(f"{BASE}/metrics/{sym}/{sym}-metrics-{day}.zip", csvdir):
                if len(r) > 7 and r[1] == sym:
                    t = int(datetime.strptime(r[0], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp() * 1000)
                    out[t] = r
        except Exception as e:
            print(f"  ! could not load metrics {day}: {e}")
    return out


# ---------------- comparison ----------------
class Checker:
    def __init__(self):
        self.ok = self.near = self.bad = 0

    def cmp(self, label, site, ref, rel=1e-6, abs_=1e-9, near_rel=0.0):
        """✓ equal (within the API's own rounding); ≈ within near_rel (Binance's live API and its later
        archive file can differ slightly in the last decimals — counted separately, never hidden); ✗ otherwise."""
        if site is None or ref is None or (isinstance(ref, float) and math.isnan(ref)):
            print(f"  ?  {label}: site={site} ref={ref}")
            return
        diff = abs(site - ref)
        if diff <= max(abs_, rel * max(abs(site), abs(ref))):
            self.ok += 1; mark = '✓'
        elif near_rel and diff <= near_rel * max(abs(site), abs(ref)):
            self.near += 1; mark = '≈'
        else:
            self.bad += 1; mark = '✗'
        print(f"  {mark}  {label}: site={site} archive={ref:.10g}" + (f"  (differs by {diff / abs(ref) * 100:.3f}%)" if mark == '≈' else ''))


def num(s):
    return float(s) if s not in (None, "", "NaN") else None


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    text = open(sys.argv[1], encoding="utf-8").read()
    csvdir = sys.argv[sys.argv.index("--csvdir") + 1] if "--csvdir" in sys.argv else None
    m = re.search(r"SELFTEST (\S+)", text)
    if not m:
        sys.exit("not a self-test report")
    sym = m.group(1)
    chk = Checker()
    print(f"Verifying {sym}")

    # ---- closed 15m candle + indicators ----
    k = re.search(r"k15 lastClosed=(\S+) O=(\S+) H=(\S+) L=(\S+) C=(\S+) V=(\S+)", text)
    ind = re.search(r"closed EMA7/25/99=(\S+)/(\S+)/(\S+) RSI6/12/24=(\S+)/(\S+)/(\S+) MA5/10=(\S+)/(\S+)", text)
    if k:
        last_ms = int(datetime.strptime(k.group(1), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp() * 1000)
        rows = load_klines(sym, "15m", last_ms, 7, csvdir)
        idx = next((i for i, r in enumerate(rows) if int(r[0]) == last_ms), None)
        if idx is None:
            print("  ✗ candle not found in the archive (day not published yet?)")
        else:
            r = rows[idx]
            print("15m candle (open/high/low/close/volume):")
            for j, lab in enumerate(["open", "high", "low", "close", "volume"], start=2):
                chk.cmp(lab, num(k.group(j)), float(r[j - 1]))
            # the site used the 498 closed candles it fetched (limit=499 minus the live one)
            window = rows[max(0, idx - 497):idx + 1]
            closes, vols = [float(x[4]) for x in window], [float(x[5]) for x in window]
            if len(window) < 498:
                print(f"  ! only {len(window)} candles available for the window (need 498) — EMA/RSI may differ slightly")
            if ind:
                print("Indicators on closed candles (independent implementation):")
                for lab, n, g in [("EMA7", 7, 1), ("EMA25", 25, 2), ("EMA99", 99, 3)]:
                    chk.cmp(lab, num(ind.group(g)), ref_ema(closes, n)[-1], rel=1e-6)
                for lab, n, g in [("RSI6", 6, 4), ("RSI12", 12, 5), ("RSI24", 24, 6)]:
                    chk.cmp(lab, num(ind.group(g)), ref_rsi_wilder(closes, n)[-1], rel=1e-5)
                for lab, n, g in [("VOL MA5", 5, 7), ("VOL MA10", 10, 8)]:
                    chk.cmp(lab, num(ind.group(g)), ref_sma(vols, n)[-1], rel=1e-6)

    # ---- positioning metrics (5m buckets) ----
    # The live API stamps each 5m statistic; the archive stamps rows with create_time. For the taker ratio the API
    # uses the period START and the archive the period END (+5 min); the others share the same stamp.
    keys = {"openInterestHist": ("sumOpenInterest", 2), "globalLS": ("longShortRatio", 6),
            "topPosition": ("longShortRatio", 5), "topAccount": ("longShortRatio", 4), "taker": ("buySellRatio", 7)}
    shift = {"taker": 300000}
    found = {name: re.search(rf"{name} ts=(\d+) .*?{field}=(\S+)", text) for name, (field, _) in keys.items()}
    any_ts = next((int(f.group(1)) for f in found.values() if f), None)
    if any_ts:
        met = load_metrics(sym, any_ts, csvdir)
        print("Positioning data (Binance 5m statistics):")
        for name, (field, col) in keys.items():
            f = found[name]
            if not f:
                continue
            row = met.get(int(f.group(1)) + shift.get(name, 0))
            if not row:
                print(f"  ?  {name}: bucket {f.group(1)} not in the archive file")
                continue
            dec = len(f.group(2).split('.')[1]) if '.' in f.group(2) else 0      # the API's own rounding
            chk.cmp(f"{name}.{field}", num(f.group(2)), float(row[col]), rel=1e-6, abs_=0.5 * 10 ** -dec + 1e-12, near_rel=1e-3)

    print(f"\nRESULT: {chk.ok} matched, {chk.near} close (Binance API vs archive, <0.1%), {chk.bad} mismatched")
    sys.exit(1 if chk.bad else 0)


if __name__ == "__main__":
    main()
