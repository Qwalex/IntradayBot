import http from 'http';
import https from 'https';
import { WebSocketServer, WebSocket } from 'ws';
import { StatsStore } from '@web/stats';
import fs from 'fs';
import { env } from '@config/env';

export type BroadcastLogFn = (level: string, message: string, data?: unknown) => void;

export class WebApp {
  private server: http.Server;
  private wss: WebSocketServer;
  private sockets = new Set<WebSocket>();
  private stats: StatsStore;
  private logSize = 0;
  readonly port: number;
  private isHttps: boolean;

  constructor(stats: StatsStore, port = env.webPort) {
    this.stats = stats;
    this.port = port;
    this.isHttps = env.httpsEnabled;

    // Простой http/https сервер с отдачей одной HTML-страницы
    const requestListener = (req: http.IncomingMessage, res: http.ServerResponse) => {
      if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.indexHtml());
        return;
      }
      if (req.url === '/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.stats.snapshot()));
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    };

    if (this.isHttps && env.httpsKeyPath && env.httpsCertPath) {
      const key = fs.readFileSync(env.httpsKeyPath);
      const cert = fs.readFileSync(env.httpsCertPath);
      this.server = https.createServer({ key, cert }, requestListener);
    } else {
      this.server = http.createServer(requestListener);
      this.isHttps = false;
    }

    // Инициализируем размер лог-файла
    try {
      const st = fs.statSync(env.logFile);
      this.logSize = st.size;
    } catch {
      this.logSize = 0;
    }

    // Создаём WS без фильтрации по path, чтобы исключить возможные несовпадения
    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on('connection', (ws) => {
      this.sockets.add(ws);
      ws.on('close', () => this.sockets.delete(ws));
      // При подключении отправляем актуальные статсы
      ws.send(JSON.stringify({ type: 'stats', payload: this.stats.snapshot() }));
      // Отправляем «хвост» логов новому клиенту (последние 64KB)
      this.sendLogTailToSocket(ws).catch(() => {});
    });

    // Watch за лог-файлом и трансляция дельты всем сокетам
    try {
      fs.watch(env.logFile, { persistent: true }, () => this.streamLogDelta().catch(() => {}));
    } catch {
      // fs.watch может не работать в некоторых окружениях, fallback периодически через setInterval
      setInterval(() => this.streamLogDelta().catch(() => {}), 1000);
    }
  }

  start(): void {
    this.server.listen(this.port);
  }

  broadcast(event: unknown): void {
    const payload = JSON.stringify(event);
    for (const ws of this.sockets) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    }
  }

  broadcastLog(level: string, message: string, data?: unknown): void {
    this.broadcast({ type: 'log', payload: { ts: Date.now(), level, message, data } });
  }

  private indexHtml(): string {
    // Минималистичный UI без зависимостей
    return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TraderBot3 — монитор</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; display: grid; grid-template-rows: auto 1fr; height: 100vh; }
    header { padding: 12px 16px; background: #0f172a; color: #e2e8f0; display:flex; align-items:center; gap:12px; }
    header h1 { font-size: 16px; margin: 0; font-weight: 600; }
    main { display: grid; grid-template-columns: 360px 1fr; gap: 0; height: 100%; }
    .panel { padding: 12px; border-right: 1px solid #e2e8f0; overflow: auto; }
    .panel h2 { font-size: 14px; margin: 0 0 8px; color: #334155; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background: #fff; }
    .label { font-size: 12px; color: #64748b; }
    .value { font-size: 18px; font-weight: 700; color: #0f172a; }
    .table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .table th, .table td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
    .log { background: #0a0f1f; color: #e2e8f0; padding: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; overflow: auto; }
    .log .row { white-space: pre-wrap; margin: 0; }
    .pill { padding: 2px 6px; border-radius: 999px; font-size: 11px; }
    .pill.buy { background: #dcfce7; color: #166534; }
    .pill.sell { background: #fee2e2; color: #991b1b; }
  </style>
</head>
<body>
  <header>
    <h1>TraderBot3 — монитор (${this.isHttps ? 'https' : 'http'} : ${this.port})</h1>
    <span id="status">Подключение…</span>
  </header>
  <main>
    <div class="panel">
      <h2>Статистика</h2>
      <div class="stats">
        <div class="card"><div class="label">Сделок всего</div><div class="value" id="totalTrades">-</div></div>
        <div class="card"><div class="label">Объем (qty)</div><div class="value" id="volume">-</div></div>
        <div class="card"><div class="label">Buy</div><div class="value" id="buyCount">-</div></div>
        <div class="card"><div class="label">Sell</div><div class="value" id="sellCount">-</div></div>
      </div>
      <h2 style="margin-top:12px;">Последние сделки</h2>
      <table class="table">
        <thead><tr><th>Время</th><th>Символ</th><th>Сторона</th><th>Qty</th><th>Цена</th></tr></thead>
        <tbody id="trades"></tbody>
      </table>
    </div>
    <div class="log" id="log"></div>
  </main>

  <script>
  const $ = (id) => document.getElementById(id);
  const statusEl = $('status');
  const logEl = $('log');
  const tradesEl = $('trades');
  const totalTradesEl = $('totalTrades');
  const volumeEl = $('volume');
  const buyCountEl = $('buyCount');
  const sellCountEl = $('sellCount');
  let logBuffer = '';

  function appendLog(row) {
    const div = document.createElement('div');
    div.className = 'row';
    const ts = new Date(row.time || row.ts || Date.now()).toLocaleTimeString();
    const levelNum = row.level;
    const levelMap = {10:'trace',20:'debug',30:'info',40:'warn',50:'error',60:'fatal'};
    const level = typeof levelNum === 'number' ? (levelMap[levelNum] || String(levelNum)) : (row.level || 'info');
    const msg = row.msg || row.message || '';
    const rest = Object.assign({}, row);
    delete rest.time; delete rest.level; delete rest.msg; delete rest.message;
    const data = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
    div.textContent = '[' + ts + '] ' + String(level).toUpperCase() + ' ' + msg + data;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function renderStats(stats) {
    totalTradesEl.textContent = stats.totalTrades;
    volumeEl.textContent = stats.volume.toFixed(6);
    buyCountEl.textContent = stats.buyCount;
    sellCountEl.textContent = stats.sellCount;

    tradesEl.innerHTML = '';
    stats.lastTrades.forEach(t => {
      const tr = document.createElement('tr');
      const time = new Date(t.time).toLocaleTimeString();
      const sidePill = '<span class="pill ' + (t.side === 'Buy' ? 'buy' : 'sell') + '">' + t.side + '</span>';
      tr.innerHTML = '<td>' + time + '</td><td>' + t.symbol + '</td><td>' + sidePill + '</td><td>' + t.qty + '</td><td>' + t.price + '</td>';
      tradesEl.appendChild(tr);
    });
  }

  function connect() {
    const wsProto = (location.protocol === 'https:') ? 'wss://' : 'ws://';
    const ws = new WebSocket(wsProto + location.host + '/ws');
    ws.onopen = () => { statusEl.textContent = 'Подключено'; };
    ws.onclose = () => { statusEl.textContent = 'Отключено. Переподключение…'; setTimeout(connect, 1500); };
    ws.onerror = () => { statusEl.textContent = 'Ошибка сокета'; };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'stats') renderStats(msg.payload);
        if (msg.type === 'trade') {
          // обновим таблицу и счётчики, запросив свежие stats
          fetch('/stats').then(r => r.json()).then(renderStats);
        }
        if (msg.type === 'logRaw') {
          logBuffer += String(msg.payload);
          const parts = logBuffer.split(/\\r?\\n/);
          logBuffer = parts.pop() || '';
          for (const line of parts) {
            if (!line.trim()) continue;
            try { appendLog(JSON.parse(line)); } catch {}
          }
        }
      } catch {}
    };
  }

  // Инициализация
  fetch('/stats').then(r => r.json()).then(renderStats);
  connect();
  </script>
</body>
</html>`;
  }

  private async sendLogTailToSocket(ws: WebSocket): Promise<void> {
    try {
      const st = fs.statSync(env.logFile);
      const end = st.size;
      const start = Math.max(0, end - 64 * 1024);
      await new Promise<void>((resolve, reject) => {
        const rs = fs.createReadStream(env.logFile, { encoding: 'utf8', start, end: end - 1 });
        rs.on('data', (chunk) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'logRaw', payload: chunk }));
        });
        rs.on('end', resolve);
        rs.on('error', reject);
      });
    } catch {}
  }

  private async streamLogDelta(): Promise<void> {
    try {
      const st = fs.statSync(env.logFile);
      const newSize = st.size;
      let from = this.logSize;
      if (newSize < this.logSize) {
        // truncate/rotation
        from = 0;
      }
      if (newSize === from) {
        this.logSize = newSize;
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const rs = fs.createReadStream(env.logFile, { encoding: 'utf8', start: from, end: newSize - 1 });
        rs.on('data', (chunk) => this.broadcast({ type: 'logRaw', payload: chunk }));
        rs.on('end', resolve);
        rs.on('error', reject);
      });
      this.logSize = newSize;
    } catch {}
  }
}

