# Tests

`node --test tests/*.test.mjs` (Node 20+, Python 3 for the verifier test). No dependencies.

- **indicators** — EMA/RSI/ATR/volume MA from `index.html` vs. independent implementations on real
  BTCUSDT data, and RSI vs. Wilder's textbook example.
- **situations** — every feature used by the situation rules is recomputed independently from raw
  archive candles/metrics; no look-ahead; rules fire exactly on their written conditions.
- **range** — the expected-movement band (`rangeAt`) vs. an independent recomputation, New York
  time slots across daylight-saving changes, refusal on short/broken history, and a sanity check
  on real BTC candles.
- **parse** — symbols pasted from the Binance app/site.
- **page** — the script parses, every referenced element exists, no external scripts.
- **verifier** — `tools/verify_report.py` re-derives a real self-test report from archive files.

Fixtures in `tests/fixtures/` are unmodified files from Binance's public archive (data.binance.vision).

## Verifying the live site
Open the site → «🔧 فحص البيانات» (or add `#selftest` to the URL) → run → «نسخ التقرير».
After that UTC day has ended, run `python3 tools/verify_report.py report.txt` to compare every number
with the official archive.

## Expected-movement band («الحركة المتوقعة») — how it was built and tested
Model (in the SHARED block, `RANGE` / `rangeAt`): the size of the move over the next 15 / 60 minutes is
predicted from the average 5m candle range over the last 1h, 4h and 24h, plus a time-of-day effect in
New York time (30-min slots, weekday/weekend). The band is price × exp(±K·size).

Data: 90 USDT perpetuals, 5m candles from Binance's archive, Nov 2025 – Oct 2026.
Fitted on Nov–Apr only; tested by running the exact `rangeAt` from `index.html` on May–Oct
(1,512,020 forecasts per horizon, the whole path checked against both bounds):

| | inside the band | high not broken | low not broken | median band | per coin | per UTC hour |
|---|---|---|---|---|---|---|
| 15 min | 79.3% | 89.6% | 89.6% | ±0.67% | 76–83% | 75–85% |
| 60 min | 79.3% | 89.5% | 89.7% | ±1.37% | 75–84% | 72–83% |

A fixed band from the 24h average alone held only 51–56% of the time in the hottest tenth of
moments (last hour much faster than the day); this model stays at ~80% from calm to hot.
It says how far the price usually moves, not which way.
