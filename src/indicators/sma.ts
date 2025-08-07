export function simpleMovingAverage(values: number[], period: number): number[] {
  if (period <= 0) throw new Error('SMA period must be > 0');
  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      result.push(sum / period);
    } else {
      result.push(NaN);
    }
  }
  return result;
}

