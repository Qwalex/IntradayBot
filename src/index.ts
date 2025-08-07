import { assertEnv, env } from '@config/env';
import { logger, attachWebApp } from '@utils/logger';
import { BybitClient } from '@clients/bybit';
import { smaCrossSignal } from '@strategy/smaCross';
import { Executor } from '@execution/executor';
import { computeOrderQty } from '@risk/manager';
import { StatsStore } from '@web/stats';
import { WebApp } from '@web/server';

async function main() {
  assertEnv();
  const client = new BybitClient();
  const executor = new Executor(client);
  const stats = new StatsStore();
  const web = new WebApp(stats, 3006);
  web.start();
  attachWebApp(web);

  logger.info({ symbol: env.symbol, timeframe: env.timeframe, mode: env.mode, paper: env.paper }, 'Intraday bot started');

  let lastSignal: 'buy' | 'sell' | 'hold' = 'hold';

  async function tick() {
    try {
      const klines = await client.getKlines(env.symbol, env.timeframe, 200);
      const closes = klines.map(k => k.close);
      const signal = smaCrossSignal(closes, 20, 50);
      const lastPrice = closes[closes.length - 1];

      if (signal !== 'hold' && signal !== lastSignal) {
        const qty = computeOrderQty(lastPrice);
        if (signal === 'buy') {
          await executor.closeAll(env.symbol);
          await executor.open('Buy', env.symbol, qty);
          logger.info({ lastPrice, qty }, 'BUY signal executed');
          // записать сделку
          stats.addTrade({ id: `${Date.now()}`, time: Date.now(), symbol: env.symbol, side: 'Buy', qty, price: lastPrice });
          web.broadcast({ type: 'trade' });
        } else if (signal === 'sell') {
          await executor.closeAll(env.symbol);
          await executor.open('Sell', env.symbol, qty);
          logger.info({ lastPrice, qty }, 'SELL signal executed');
          stats.addTrade({ id: `${Date.now()}`, time: Date.now(), symbol: env.symbol, side: 'Sell', qty, price: lastPrice });
          web.broadcast({ type: 'trade' });
        }
        lastSignal = signal;
      }
    } catch (err) {
      logger.error({ err }, 'Tick error');
    }
  }

  // Первичный вызов и интервал (каждые 15 секунд)
  await tick();
  setInterval(tick, 15_000);
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});

