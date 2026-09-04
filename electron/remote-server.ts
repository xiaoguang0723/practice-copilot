import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import os from 'node:os'
import QRCode from 'qrcode'
import { marked } from 'marked'

export interface RemoteServerStatus {
  active: boolean
  availableIps: Array<{ address: string; name: string }>
  clientCount: number
  ip: string
  outputTarget: 'both' | 'remote-only'
  port: number
  qrDataUrl: string
  url: string
}

export function getAllAvailableIps(): Array<{ address: string; name: string }> {
  const nets = os.networkInterfaces()
  const candidates: Array<{ address: string; name: string; priority: number }> = []

  const virtualKeywords = [
    'meta', 'clash', 'tun', 'tap', 'vethernet', 'wsl', 'hyper-v',
    'virtual', 'vmware', 'vbox', 'tailscale', 'zerotier', 'docker'
  ]

  for (const name of Object.keys(nets)) {
    const lowerName = name.toLowerCase()
    const isVirtual = virtualKeywords.some((k) => lowerName.includes(k))

    for (const net of nets[name] ?? []) {
      if (net.family !== 'IPv4' || net.internal) continue
      const addr = net.address
      if (addr.startsWith('127.') || addr.startsWith('169.254.') || addr.startsWith('198.18.') || addr.startsWith('198.19.')) {
        continue
      }

      let priority = 10
      if (isVirtual) {
        priority = 0
      } else if (lowerName.includes('wlan') || lowerName.includes('wi-fi') || lowerName.includes('wifi')) {
        priority = 100
      } else if (lowerName.includes('以太网') || lowerName.includes('ethernet')) {
        priority = 80
      } else if (addr.startsWith('192.168.')) {
        priority = 60
      } else if (addr.startsWith('10.') || addr.startsWith('172.')) {
        priority = 50
      }

      candidates.push({ address: addr, name, priority })
    }
  }

  candidates.sort((a, b) => b.priority - a.priority)
  return candidates.map(({ address, name }) => ({ address, name }))
}

export function getLocalIp(preferredIp?: string): string {
  const available = getAllAvailableIps()
  if (preferredIp && available.some((cand) => cand.address === preferredIp)) {
    return preferredIp
  }
  return available[0]?.address ?? '127.0.0.1'
}

export function generateToken(): string {
  return randomBytes(12).toString('hex')
}

export function renderMarkdownToHtml(markdown: string): string {
  if (!markdown) return ''
  let normalized = markdown
  const fenceCount = (normalized.match(/```/g) || []).length
  if (fenceCount % 2 === 1) {
    normalized += '\n```'
  }
  let html = marked.parse(normalized, { gfm: true, breaks: true }) as string

  // Enhance code blocks: highlight comments in Python/Bash
  html = html.replace(/<code class="language-([^"]+)">([\s\S]*?)<\/code>/g, (match, lang, code) => {
    let highlighted = code
    if (lang === 'python' || lang === 'py' || lang === 'bash' || lang === 'sh') {
      highlighted = highlighted.replace(/(#.*$)/gm, '<span style="color:#8b949e;font-style:italic;">$1</span>')
    }
    return `<code class="language-${lang}">${highlighted}</code>`
  })

  return html
}

export class RemoteCompanionServer {
  private activeClients = new Set<ServerResponse>()
  private port = 5188
  private server?: Server
  private token = ''
  private outputTarget: 'both' | 'remote-only' = 'both'
  private preferredIp?: string
  private turnTexts = new Map<string, string>()

  constructor() {}

  async start(port: number, token: string, outputTarget: 'both' | 'remote-only' = 'both', preferredIp?: string): Promise<RemoteServerStatus> {
    this.stop()
    this.port = port
    this.token = token || generateToken()
    this.outputTarget = outputTarget
    this.preferredIp = preferredIp

    const server = createServer((req, res) => {
      this.handleRequest(req, res)
    })

    return new Promise((resolve, reject) => {
      server.once('error', (err) => {
        reject(err)
      })

      server.listen(this.port, '0.0.0.0', async () => {
        this.server = server
        const status = await this.getStatus()
        resolve(status)
      })
    })
  }

  stop(): void {
    for (const client of this.activeClients) {
      try {
        client.end()
      } catch {
        // ignore
      }
    }
    this.activeClients.clear()
    this.turnTexts.clear()
    if (this.server) {
      this.server.close()
      this.server = undefined
    }
  }

  setOutputTarget(target: 'both' | 'remote-only'): void {
    this.outputTarget = target
  }

  broadcast(event: string, data: unknown): void {
    let broadcastData = data

    if (event === 'turn-start') {
      const turnId = (data as { turnId?: string })?.turnId
      if (turnId) this.turnTexts.set(turnId, '')
    } else if (event === 'delta') {
      const turnId = (data as { turnId?: string })?.turnId
      const delta = (data as { delta?: string })?.delta ?? ''
      if (turnId) {
        const accumulated = (this.turnTexts.get(turnId) ?? '') + delta
        this.turnTexts.set(turnId, accumulated)
        broadcastData = { ...(data as object), html: renderMarkdownToHtml(accumulated) }
      }
    } else if (event === 'done') {
      const turnId = (data as { turnId?: string })?.turnId
      if (turnId) {
        const accumulated = this.turnTexts.get(turnId) ?? ''
        broadcastData = { ...(data as object), html: renderMarkdownToHtml(accumulated) }
      }
    } else if (event === 'clear') {
      this.turnTexts.clear()
    }

    const payload = `event: ${event}\ndata: ${JSON.stringify(broadcastData)}\n\n`
    for (const client of this.activeClients) {
      try {
        client.write(payload)
      } catch {
        this.activeClients.delete(client)
      }
    }
  }

  getClientCount(): number {
    return this.activeClients.size
  }

  async getStatus(): Promise<RemoteServerStatus> {
    const availableIps = getAllAvailableIps()
    const ip = getLocalIp(this.preferredIp)
    const active = Boolean(this.server?.listening)
    const url = active ? `http://${ip}:${this.port}?token=${this.token}` : ''
    let qrDataUrl = ''
    if (url) {
      try {
        qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 })
      } catch {
        qrDataUrl = ''
      }
    }

    return {
      active,
      availableIps,
      clientCount: this.activeClients.size,
      ip,
      outputTarget: this.outputTarget,
      port: this.port,
      qrDataUrl,
      url
    }
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const rawUrl = req.url ?? '/'
    const parsed = new URL(rawUrl, `http://localhost:${this.port}`)
    const reqToken = parsed.searchParams.get('token')

    // 未授权请求静默返回 404，防止局域网端口扫描与探测
    if (!this.token || reqToken !== this.token) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }

    // SSE 流式通道
    if (parsed.pathname === '/api/stream') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Content-Type': 'text/event-stream'
      })
      res.write(`event: ready\ndata: ${JSON.stringify({ clientCount: this.activeClients.size + 1 })}\n\n`)
      this.activeClients.add(res)

      req.on('close', () => {
        this.activeClients.delete(res)
      })
      return
    }

    // 默认返回移动端 Web 客户端
    if (parsed.pathname === '/' || parsed.pathname === '/index.html') {
      const html = this.renderMobileHtml(this.token)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }

  private renderMobileHtml(token: string): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#030712">
  <title>Practice Copilot · 远端副屏</title>
  <style>
    :root {
      --base-font-size: 13px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      overscroll-behavior-y: none;
      -webkit-overflow-scrolling: touch;
    }
    body {
      background: #030712;
      color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: var(--base-font-size);
      line-height: 1.58;
      padding-bottom: 80px;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      background: rgba(3, 7, 18, 0.94);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      color: #93c5fd;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 500;
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
    }
    .status-badge.disconnected {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #e5e7eb;
      padding: 3px 8px;
      border-radius: 5px;
      font-size: 11px;
      cursor: pointer;
      user-select: none;
    }
    .btn:active { background: rgba(255, 255, 255, 0.2); }
    #container {
      padding: 12px 16px;
      max-width: 880px;
      margin: 0 auto;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      color: #6b7280;
      text-align: center;
      gap: 12px;
    }
    .empty-icon {
      font-size: 32px;
      color: #3b82f6;
      opacity: 0.8;
    }
    .card {
      background: rgba(17, 24, 39, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 14px 16px;
      margin-bottom: 14px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }
    .user-text {
      padding: 6px 10px;
      background: rgba(59, 130, 246, 0.12);
      border-left: 3px solid #3b82f6;
      border-radius: 4px;
      font-size: 12px;
      color: #bfdbfe;
      margin-bottom: 12px;
      word-break: break-word;
    }
    .markdown-content {
      color: #f3f4f6;
      word-break: break-word;
      font-size: var(--base-font-size);
      line-height: 1.58;
    }
    .markdown-content p { margin: 6px 0; }
    .markdown-content h1 {
      font-size: 1.18em !important;
      color: #60a5fa;
      margin: 8px 0 4px !important;
      font-weight: 600;
      line-height: 1.35;
    }
    .markdown-content h2 {
      font-size: 1.10em !important;
      color: #93c5fd;
      margin: 7px 0 3px !important;
      font-weight: 600;
      line-height: 1.35;
    }
    .markdown-content h3 {
      font-size: 1.04em !important;
      color: #bfdbfe;
      margin: 6px 0 3px !important;
      font-weight: 600;
      line-height: 1.35;
    }
    .markdown-content pre {
      background: #0d1117;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      padding: 12px 14px;
      margin: 10px 0;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 0.92em;
      line-height: 1.55;
      color: #e6edf3;
      tab-size: 4;
      -moz-tab-size: 4;
      white-space: pre !important;
      word-break: normal !important;
      word-wrap: normal !important;
    }
    .markdown-content code {
      background: rgba(59, 130, 246, 0.15);
      color: #93c5fd;
      padding: 2px 5px;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.9em;
    }
    .markdown-content pre code {
      background: transparent !important;
      padding: 0 !important;
      color: inherit !important;
      font-family: inherit !important;
      font-size: inherit !important;
      white-space: pre !important;
      word-break: normal !important;
      word-wrap: normal !important;
    }
    .markdown-content ul, .markdown-content ol { padding-left: 20px; margin: 6px 0; }
    .markdown-content blockquote {
      border-left: 3px solid #6b7280;
      padding-left: 10px;
      color: #9ca3af;
      margin: 6px 0;
    }
    .cursor {
      display: inline-block;
      width: 5px;
      height: 13px;
      background: #60a5fa;
      vertical-align: -2px;
      margin-left: 2px;
      animation: blink 1s steps(1) infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>⚡ 远端副屏</span>
      <div id="statusBadge" class="status-badge">
        <span class="status-dot"></span>
        <span id="statusText">正在连接...</span>
      </div>
    </div>
    <div class="header-actions">
      <button class="btn" id="fontDown" title="缩小字号">A-</button>
      <button class="btn" id="fontUp" title="放大字号">A+</button>
      <button class="btn" id="clearBtn">清屏</button>
    </div>
  </header>

  <main id="container">
    <div class="empty-state" id="emptyState">
      <div class="empty-icon">📡</div>
      <p>已连接主控电脑<br><small style="color:#4b5563">在电脑端按下快捷键，答案将实时流式展示于此</small></p>
    </div>
    <div id="turnsList"></div>
  </main>

  <script>
    const TOKEN = ${JSON.stringify(token)};
    const statusBadge = document.getElementById('statusBadge');
    const statusText = document.getElementById('statusText');
    const turnsList = document.getElementById('turnsList');
    const emptyState = document.getElementById('emptyState');
    const clearBtn = document.getElementById('clearBtn');

    // 字体调节
    const fontLevels = [11, 12, 13, 14, 15, 17, 20];
    let fontIndex = 2; // 默认 13px
    try {
      const saved = localStorage.getItem('remote_font_idx');
      if (saved !== null) {
        const idx = parseInt(saved, 10);
        if (!isNaN(idx) && idx >= 0 && idx < fontLevels.length) {
          fontIndex = idx;
        }
      }
    } catch (e) {}

    function applyFontSize() {
      document.documentElement.style.setProperty('--base-font-size', fontLevels[fontIndex] + 'px');
      try {
        localStorage.setItem('remote_font_idx', fontIndex.toString());
      } catch (e) {}
    }
    applyFontSize();

    document.getElementById('fontDown').addEventListener('click', () => {
      if (fontIndex > 0) {
        fontIndex--;
        applyFontSize();
      }
    });
    document.getElementById('fontUp').addEventListener('click', () => {
      if (fontIndex < fontLevels.length - 1) {
        fontIndex++;
        applyFontSize();
      }
    });

    let currentTurnId = null;
    let currentCard = null;
    let currentContentEl = null;
    let currentCursor = null;
    let rawText = '';

    // 双重保活防熄屏：优先 Wake Lock，降级使用静音微型循环视频管道（通杀所有移动端浏览器）
    function enableKeepAwake() {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').catch(() => {});
      }
      try {
        let v = document.getElementById('noSleepVideo');
        if (!v) {
          v = document.createElement('video');
          v.id = 'noSleepVideo';
          v.setAttribute('playsinline', '');
          v.setAttribute('webkit-playsinline', '');
          v.muted = true;
          v.loop = true;
          v.style.position = 'fixed';
          v.style.width = '1px';
          v.style.height = '1px';
          v.style.opacity = '0.001';
          v.style.pointerEvents = 'none';
          v.src = 'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAW1wNDJpc29tYXZjMQAAACFtb292AAAAbG12aGQAAAAA1uL0g9bi9IMAAAPoAAAAAAABAAEAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAB0dHJhazAAAAA=';
          document.body.appendChild(v);
        }
        v.play().catch(() => {});
      } catch (_) {}
    }
    enableKeepAwake();
    document.addEventListener('touchstart', enableKeepAwake, { once: true });
    document.addEventListener('click', enableKeepAwake, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') enableKeepAwake();
    });

    let userScrolledUp = false;
    window.addEventListener('scroll', () => {
      const distFromBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      userScrolledUp = distFromBottom > 150;
    }, { passive: true });

    function autoFollowBottom() {
      if (userScrolledUp) return;
      window.scrollTo(0, document.documentElement.scrollHeight);
    }

    clearBtn.addEventListener('click', () => {
      turnsList.innerHTML = '';
      emptyState.style.display = 'flex';
      currentTurnId = null;
    });

    function formatMarkdown(text) {
      if (!text) return '';
      var b = String.fromCharCode(96);
      var codeBlocks = [];

      // 1. 提取所有代码块（无论是否已闭合），使用占位符保护，避免代码内的 # 注释被误解析为 h1/h2
      var codeBlockRe = new RegExp(b + b + b + '(?:[a-zA-Z0-9_-]+)?(?:\\n|\\r\\n)?([\\s\\S]*?)(?:' + b + b + b + '|$)', 'g');
      var out = text.replace(codeBlockRe, function(match, code) {
        var id = '___CODEBLOCK_' + codeBlocks.length + '___';
        var esc = code
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        codeBlocks.push('<pre><code>' + esc + '</code></pre>');
        return id;
      });

      // 2. 转义普通文本中的 HTML 标签
      out = out
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // 3. 行内代码
      var inlineRe = new RegExp(b + '([^' + b + ']+)' + b, 'g');
      out = out.replace(inlineRe, '<code>$1</code>');

      // 4. 标题 (此时代码块内部的 # 已经被保护，绝对不会变成标题)
      out = out.replace(/^### (.*$)/gim, '<h3>$1</h3>');
      out = out.replace(/^## (.*$)/gim, '<h2>$1</h2>');
      out = out.replace(/^# (.*$)/gim, '<h1>$1</h1>');

      // 5. 粗体与斜体
      out = out.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>');
      out = out.replace(/\\*(.*?)\\*/g, '<em>$1</em>');

      // 6. 引用与无序列表
      out = out.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');
      out = out.replace(/^[\\*\\-] (.*$)/gim, '<li>$1</li>');

      // 7. 换行
      out = out.replace(/\\n/g, '<br>');

      // 8. 还原代码块
      for (var i = 0; i < codeBlocks.length; i++) {
        out = out.replace('___CODEBLOCK_' + i + '___', codeBlocks[i]);
      }

      return out;
    }

    function createTurnCard(turnId, userText) {
      emptyState.style.display = 'none';
      const card = document.createElement('div');
      card.className = 'card';
      card.id = 'turn-' + turnId;

      if (userText) {
        const userEl = document.createElement('div');
        userEl.className = 'user-text';
        userEl.textContent = userText;
        card.appendChild(userEl);
      }

      const contentEl = document.createElement('div');
      contentEl.className = 'markdown-content';
      card.appendChild(contentEl);

      const cursor = document.createElement('span');
      cursor.className = 'cursor';
      card.appendChild(cursor);

      turnsList.appendChild(card);
      currentTurnId = turnId;
      currentCard = card;
      currentContentEl = contentEl;
      currentCursor = cursor;
      rawText = '';

      userScrolledUp = false;
      autoFollowBottom();
    }

    function connectSSE() {
      const source = new EventSource('/api/stream?token=' + encodeURIComponent(TOKEN));

      source.onopen = () => {
        statusBadge.className = 'status-badge';
        statusText.textContent = '已连接';
      };

      source.onerror = () => {
        statusBadge.className = 'status-badge disconnected';
        statusText.textContent = '连接中断，重试中...';
      };

      source.addEventListener('turn-start', (e) => {
        try {
          const data = JSON.parse(e.data);
          createTurnCard(data.turnId, data.userText);
        } catch (_) {}
      });

      source.addEventListener('delta', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (!currentCard || data.turnId !== currentTurnId) {
            createTurnCard(data.turnId, '');
            userScrolledUp = false;
          }
          if (data.html) {
            currentContentEl.innerHTML = data.html;
          } else if (data.delta) {
            rawText += data.delta;
            currentContentEl.innerHTML = formatMarkdown(rawText);
          }
          autoFollowBottom();
        } catch (_) {}
      });

      source.addEventListener('done', (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data && data.html && currentContentEl) {
            currentContentEl.innerHTML = data.html;
          }
        } catch (_) {}
        if (currentCursor) {
          currentCursor.remove();
          currentCursor = null;
        }
        autoFollowBottom();
      });

      source.addEventListener('clear', () => {
        turnsList.innerHTML = '';
        emptyState.style.display = 'flex';
        currentTurnId = null;
      });

      source.addEventListener('scroll', (e) => {
        try {
          const data = JSON.parse(e.data);
          const delta = typeof data.delta === 'number' ? data.delta : (data.direction === 'up' ? -260 : 260);
          window.scrollBy({
            top: delta,
            behavior: 'smooth'
          });
        } catch (_) {}
      });
    }

    connectSSE();
  </script>
</body>
</html>`
  }
}
