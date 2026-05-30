import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = process.env.REVVO_BASE_URL || 'http://localhost:5180';
const width = Number(process.env.REVVO_WIDTH || 360);
const height = Number(process.env.REVVO_HEIGHT || 900);
const routes = [
  ['home', '/banco/revvo-home-v2-preview.html'],
  ['create', '/banco/revvo-criar-missao-v2-preview.html'],
  ['missions', '/dev/revvo-missions']
];

const outDir = resolve('..', 'tmp', 'revvo-cdp-screens');
mkdirSync(outDir, { recursive: true });

const port = 9333 + Math.floor(Math.random() * 400);
const profile = resolve('..', 'tmp', `edge-cdp-${Date.now()}-${width}`);

const browser = spawn(edgePath, [
  '--headless=new',
  '--disable-gpu',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function getJson(path) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      if (response.ok) return response.json();
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`CDP endpoint not ready: ${path}`);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = [];

  ws.addEventListener('message', (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
      return;
    }
    events.push(data);
  });

  const opened = new Promise((resolveOpen, rejectOpen) => {
    ws.addEventListener('open', resolveOpen, { once: true });
    ws.addEventListener('error', rejectOpen, { once: true });
  });

  const send = async (method, params = {}) => {
    await opened;
    id += 1;
    const current = id;
    ws.send(JSON.stringify({ id: current, method, params }));
    const data = await new Promise((resolveSend) => pending.set(current, resolveSend));
    if (data.error) throw new Error(`${method}: ${JSON.stringify(data.error)}`);
    return data.result || {};
  };

  const waitFor = async (method, timeout = 15000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const index = events.findIndex((event) => event.method === method);
      if (index >= 0) return events.splice(index, 1)[0];
      await sleep(50);
    }
    throw new Error(`Timed out waiting for ${method}`);
  };

  return { send, waitFor, close: () => ws.close() };
}

try {
  await getJson('/json/version');

  const results = [];
  for (const [name, path] of routes) {
    const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${baseUrl}${path}?cdp=${Date.now()}-${width}`)}`, { method: 'PUT' }).then((r) => r.json());
    const page = connect(target.webSocketDebuggerUrl);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await page.send('Page.navigate', { url: `${baseUrl}${path}?cdp=${Date.now()}-${width}` });
    await page.waitFor('Page.loadEventFired');
    await sleep(700);

    const metrics = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const app = document.querySelector('.revvo-canvas-app');
        const surface = document.querySelector('.revvo-canvas-surface');
        const scale = app ? getComputedStyle(app).getPropertyValue('--revvo-canvas-scale').trim() : '';
        const design = app ? getComputedStyle(app).getPropertyValue('--revvo-canvas-design-width').trim() : '';
        const rect = surface ? surface.getBoundingClientRect() : null;
        const typeRow = document.querySelector('.revvo-create__typeRow');
        const shortcuts = document.querySelector('.revvo-preview__shortcuts');
        const filters = document.querySelector('.revvo-missions__chips');
        const row = typeRow || shortcuts || filters;
        const children = row ? [...row.children].filter((el) => el.offsetParent !== null) : [];
        const tops = [...new Set(children.map((el) => Math.round(el.getBoundingClientRect().top)))];
        return {
          innerWidth: window.innerWidth,
          scale,
          design,
          surfaceRight: rect ? Math.round(rect.right) : null,
          childCount: children.length,
          rowCount: tops.length
        };
      })()`
    });

    const shot = join(outDir, `${name}-${width}.png`);
    const png = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(shot, Buffer.from(png.data, 'base64'));
    results.push({ name, path, screenshot: shot, ...metrics.result.value });
    page.close();
  }

  console.log(JSON.stringify({ width, height, results }, null, 2));
} finally {
  browser.kill();
}
