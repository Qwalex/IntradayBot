export type TradeRecord = {
  id: string;
  time: number;
  symbol: string;
  side: 'Buy' | 'Sell';
  qty: number;
  price: number;
};

export type StatsSnapshot = {
  totalTrades: number;
  buyCount: number;
  sellCount: number;
  volume: number;
  lastTrades: TradeRecord[];
};

export class StatsStore {
  private trades: TradeRecord[] = [];
  private maxKeep = 200;

  addTrade(t: TradeRecord) {
    this.trades.push(t);
    if (this.trades.length > this.maxKeep) {
      this.trades.splice(0, this.trades.length - this.maxKeep);
    }
  }

  snapshot(): StatsSnapshot {
    const buyCount = this.trades.filter((t) => t.side === 'Buy').length;
    const sellCount = this.trades.filter((t) => t.side === 'Sell').length;
    const volume = this.trades.reduce((acc, t) => acc + t.qty, 0);
    return {
      totalTrades: this.trades.length,
      buyCount,
      sellCount,
      volume,
      lastTrades: [...this.trades].slice(-50).reverse(),
    };
  }
}


