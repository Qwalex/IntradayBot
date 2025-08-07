import dotenv from 'dotenv';

dotenv.config();

export type TradingMode = 'linear' | 'inverse' | 'option' | 'spot';

export const env = {
  bybitApiKey: process.env.BYBIT_API_KEY ?? '',
  bybitApiSecret: process.env.BYBIT_API_SECRET ?? '',
  bybitBaseUrl: process.env.BYBIT_BASE_URL ?? 'https://api.bybit.com',
  symbol: process.env.SYMBOL ?? 'BTCUSDT',
  mode: (process.env.TRADING_MODE as TradingMode) ?? 'linear',
  timeframe: process.env.TIMEFRAME ?? '1', // minutes for intraday
  leverage: Number(process.env.LEVERAGE ?? '2'),
  riskPerTrade: Number(process.env.RISK_PER_TRADE ?? '0.01'), // 1% of equity
  maxOpenPositions: Number(process.env.MAX_OPEN_POSITIONS ?? '1'),
  paper: (process.env.PAPER ?? 'true') === 'true',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  logFile: process.env.LOG_FILE ?? 'logs/app.log',
  webPort: Number(process.env.WEB_PORT ?? '3006'),
  httpsEnabled: (process.env.HTTPS_ENABLED ?? 'false') === 'true',
  httpsKeyPath: process.env.HTTPS_KEY_PATH ?? '',
  httpsCertPath: process.env.HTTPS_CERT_PATH ?? ''
} as const;

export function assertEnv() {
  if (!env.bybitApiKey || !env.bybitApiSecret) {
    console.warn('BYBIT_API_KEY/BYBIT_API_SECRET пусты. Включён paper-режим для безопасности.');
  }
}

