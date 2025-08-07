import axios, { AxiosInstance } from 'axios';
import { createHmac } from 'crypto';
import { env } from '@config/env';
import { logger } from '@utils/logger';

export type Kline = {
  start: number; // ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type BybitResponse<T> = {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
};

export class BybitClient {
  private http: AxiosInstance;

  constructor(baseURL = env.bybitBaseUrl) {
    this.http = axios.create({ baseURL, timeout: 15000 });
  }

  async getKlines(symbol: string, interval: string, limit: number): Promise<Kline[]> {
    const params = {
      category: env.mode,
      symbol,
      interval,
      limit: String(limit)
    } as const;

    const { data } = await this.http.get<BybitResponse<{ list: string[][] }>>('/v5/market/kline', { params });
    if (data.retCode !== 0) {
      throw new Error(`Bybit kline error: ${data.retMsg}`);
    }
    // list: [start, open, high, low, close, volume, turnover]
    const klines = data.result.list
      .map((row) => ({
        start: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5])
      }))
      .sort((a, b) => a.start - b.start);
    return klines;
  }

  async createOrder(body: Record<string, unknown>): Promise<unknown> {
    return this.privatePost('/v5/order/create', body);
  }

  async cancelAll(symbol: string): Promise<unknown> {
    return this.privatePost('/v5/order/cancel-all', {
      category: env.mode,
      symbol
    });
  }

  async getPositions(symbol: string): Promise<unknown> {
    return this.privateGet('/v5/position/list', { category: env.mode, symbol });
  }

  async setLeverage(symbol: string, buyLeverage: number, sellLeverage: number): Promise<unknown> {
    return this.privatePost('/v5/position/set-leverage', {
      category: env.mode,
      symbol,
      buyLeverage: String(buyLeverage),
      sellLeverage: String(sellLeverage)
    });
  }

  private async privateGet(path: string, params: Record<string, unknown>) {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const query = new URLSearchParams(params as Record<string, string>).toString();
    const signStr = `${timestamp}${env.bybitApiKey}${recvWindow}${query}`;
    const sign = createHmac('sha256', env.bybitApiSecret).update(signStr).digest('hex');

    const headers = {
      'X-BAPI-API-KEY': env.bybitApiKey,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'X-BAPI-SIGN': sign
    };

    const url = query ? `${path}?${query}` : path;
    const { data } = await this.http.get(url, { headers });
    if (data.retCode !== 0) {
      logger.error({ data }, 'Bybit private GET error');
      throw new Error(`Bybit error: ${data.retMsg}`);
    }
    return data.result;
  }

  private async privatePost(path: string, body: Record<string, unknown>) {
    const timestamp = Date.now().toString();
    const recvWindow = '5000';
    const bodyStr = JSON.stringify(body);
    const signStr = `${timestamp}${env.bybitApiKey}${recvWindow}${bodyStr}`;
    const sign = createHmac('sha256', env.bybitApiSecret).update(signStr).digest('hex');
    const headers = {
      'X-BAPI-API-KEY': env.bybitApiKey,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'X-BAPI-SIGN': sign,
      'Content-Type': 'application/json'
    };
    const { data } = await this.http.post(path, body, { headers });
    if (data.retCode !== 0) {
      logger.error({ data }, 'Bybit private POST error');
      throw new Error(`Bybit error: ${data.retMsg}`);
    }
    return data.result;
  }
}

