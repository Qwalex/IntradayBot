import { simpleMovingAverage } from '@indicators/sma';

export type Signal = 'buy' | 'sell' | 'hold';

export function smaCrossSignal(closes: number[], shortPeriod = 20, longPeriod = 50): Signal {
  if (closes.length < longPeriod + 2) return 'hold';
  const smaShort = simpleMovingAverage(closes, shortPeriod);
  const smaLong = simpleMovingAverage(closes, longPeriod);

  const n = closes.length - 1;
  const prev = n - 1;
  const prevDiff = smaShort[prev] - smaLong[prev];
  const lastDiff = smaShort[n] - smaLong[n];

  if (Number.isNaN(prevDiff) || Number.isNaN(lastDiff)) return 'hold';
  if (prevDiff <= 0 && lastDiff > 0) return 'buy';
  if (prevDiff >= 0 && lastDiff < 0) return 'sell';
  return 'hold';
}

