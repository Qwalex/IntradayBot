import { BybitClient } from '@clients/bybit';
import { env } from '@config/env';
import { logger } from '@utils/logger';
import { PositionState, Side } from '@risk/manager';

export class Executor {
  private client: BybitClient;
  private paperPosition: PositionState = { side: 'None', qty: 0, avgPrice: 0 };

  constructor(client: BybitClient) {
    this.client = client;
  }

  get position(): PositionState {
    return this.paperPosition;
  }

  async open(side: Side, symbol: string, qty: number): Promise<void> {
    if (qty <= 0) return;
    if (env.paper || !env.bybitApiKey || !env.bybitApiSecret) {
      logger.info({ side, symbol, qty }, '[PAPER] Open');
      this.simulateOpen(side, qty);
      return;
    }
    await this.client.createOrder({
      category: env.mode,
      symbol,
      side,
      orderType: 'Market',
      qty: String(qty),
      timeInForce: 'IOC'
    });
  }

  async closeAll(symbol: string): Promise<void> {
    if (env.paper || !env.bybitApiKey || !env.bybitApiSecret) {
      logger.info({ symbol }, '[PAPER] Close all');
      this.paperPosition = { side: 'None', qty: 0, avgPrice: 0 };
      return;
    }
    await this.client.cancelAll(symbol);
  }

  private simulateOpen(side: Side, qty: number) {
    this.paperPosition = { side, qty, avgPrice: this.paperPosition.avgPrice };
  }
}

