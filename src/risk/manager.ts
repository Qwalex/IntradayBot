import { env } from '@config/env';

export type Side = 'Buy' | 'Sell';

export interface PositionState {
  side: Side | 'None';
  qty: number;
  avgPrice: number;
}

export function computeOrderQty(price: number): number {
  // Упрощённо: фиксированный нотационал из .env, расчёт size = notional / price
  const notional = Number(process.env.ORDER_NOTIONAL ?? '50');
  const qty = notional / price;
  return Number(qty.toFixed(6));
}

