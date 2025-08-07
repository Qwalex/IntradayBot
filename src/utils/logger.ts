import pino from 'pino';
import { env } from '@config/env';
import type { WebApp } from '@web/server';
import fs from 'fs';
import path from 'path';

// Обеспечим наличие каталога для логов
try {
  const dir = path.dirname(env.logFile);
  fs.mkdirSync(dir, { recursive: true });
} catch {}

export const logger = pino(
  {
    level: env.logLevel,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([
    // Красивый вывод в консоль
    { stream: pino.transport({ target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }) },
    // Чистый JSON в файл
    { stream: fs.createWriteStream(env.logFile, { flags: 'a' }) },
  ])
);

// Глобальный регистратор веб-слушателя для трансляции логов в WS
let webAppRef: WebApp | null = null;

export function attachWebApp(app: WebApp) {
  webAppRef = app;
}

// Обёртки для отправки логов в WebSocket
function broadcast(level: string, message: string, data?: unknown) {
  try {
    webAppRef?.broadcastLog(level, message, data);
  } catch {}
}

const baseInfo = logger.info.bind(logger);
logger.info = ((...args: unknown[]) => {
  // формат pino: [obj?, msg]
  if (typeof args[0] === 'string') {
    broadcast('info', String(args[0]));
  } else if (typeof args[1] === 'string') {
    broadcast('info', String(args[1]), args[0]);
  }
  return baseInfo(...args as Parameters<typeof baseInfo>);
}) as typeof logger.info;

const baseError = logger.error.bind(logger);
logger.error = ((...args: unknown[]) => {
  if (typeof args[0] === 'string') {
    broadcast('error', String(args[0]));
  } else if (typeof args[1] === 'string') {
    broadcast('error', String(args[1]), args[0]);
  }
  return baseError(...args as Parameters<typeof baseError>);
}) as typeof logger.error;


