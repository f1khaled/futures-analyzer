import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFunctions } from './helpers.mjs';

const { cleanInput } = loadFunctions(['cleanInput'], ['AR']);

test('symbols pasted from the Binance app/site are understood', () => {
  const cases = {
    'BTCUSDT Perpetual': 'BTCUSDT', 'BTCUSDT 永续': 'BTCUSDT', 'btc/usdt': 'BTCUSDT', '$sol': 'SOL', ' cysusdt ': 'CYSUSDT',
    'https://www.binance.com/en/futures/ETHUSDT?ref=ABC': 'ETHUSDT', 'binance.com/ar/futures/1000PEPEUSDT': '1000PEPEUSDT',
    'BTCUSDT_251226': 'BTCUSDT', 'CYSUSDT دائم': 'CYSUSDT', '١٠٠٠PEPE': '1000PEPE',
  };
  for (const [input, want] of Object.entries(cases)) assert.equal(cleanInput(input), want, input);
});

test('empty or Arabic-only input gives an empty token (the UI then explains)', () => {
  assert.equal(cleanInput(''), ''); assert.equal(cleanInput('بيتكوين'), '');
});
