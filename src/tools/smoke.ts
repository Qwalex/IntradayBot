import { env } from '@config/env';
import { BybitClient } from '@clients/bybit';
import { logger } from '@utils/logger';

async function run() {
  const client = new BybitClient();
  const klines = await client.getKlines(env.symbol, env.timeframe, 5);
  logger.info({ len: klines.length, last: klines[klines.length - 1] }, 'Smoke klines');
}

run().catch((err) => {
  logger.error({ err }, 'Smoke failed');
  process.exit(1);
});

