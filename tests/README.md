# Tests

`node --test tests/*.test.mjs` (Node 20+, Python 3 for the verifier test). No dependencies.

- **indicators** — EMA/RSI/ATR/volume MA from `index.html` vs. independent implementations on real
  BTCUSDT data, and RSI vs. Wilder's textbook example.
- **situations** — every feature used by the situation rules is recomputed independently from raw
  archive candles/metrics; no look-ahead; rules fire exactly on their written conditions.
- **parse** — symbols pasted from the Binance app/site.
- **page** — the script parses, every referenced element exists, no external scripts.
- **verifier** — `tools/verify_report.py` re-derives a real self-test report from archive files.

Fixtures in `tests/fixtures/` are unmodified files from Binance's public archive (data.binance.vision).

## Verifying the live site
Open the site → «🔧 فحص البيانات» (or add `#selftest` to the URL) → run → «نسخ التقرير».
After that UTC day has ended, run `python3 tools/verify_report.py report.txt` to compare every number
with the official archive.
