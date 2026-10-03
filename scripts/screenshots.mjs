// Captures UI state screenshots with local Chrome over CDP (no test deps):
//   npm run build && node scripts/screenshots.mjs [port] [chromePath]
// Starts its own server on a throwaway data file (scripts/isolated-server.mjs); your .data/ is never touched.
// Uses Chrome's fake camera; the "denied" shot runs a second browser that refuses permission prompts.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startIsolatedServer } from './isolated-server.mjs';

const { base } = await startIsolatedServer(Number(process.argv[2] ?? 3107));
const chrome = process.argv[3] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out = 'docs/screenshots';
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function browser(extra) {
  const dir = mkdtempSync(join(tmpdir(), 'breadcrumb-chrome-')); // unique scratch profile per browser
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`,
    '--no-first-run', '--use-fake-device-for-media-stream', ...extra, 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    // Read the port from our unique profile; never attach to somebody else's debugging browser.
    let port;
    try { port = Number(readFileSync(join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]); }
    catch { continue; }
    target = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === 'page')).catch(() => null);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const waiting = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); waiting.get(m.id)?.(m); waiting.delete(m.id); });
  const send = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const page = {
    size: (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile }),
    go: async (path) => { await send('Page.navigate', { url: base + path }); await sleep(1500); },
    eval: (expression) => send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
    click: async (text) => {
      const r = await page.eval(`(() => { const el = [...document.querySelectorAll('button,a,label')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}); if (!el) return 'missing'; el.click(); return 'ok'; })()`);
      if (r.result.result.value !== 'ok') throw new Error(`No element with text: ${text}`);
      await sleep(700);
    },
    shot: async (name, full = false) => {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
      writeFileSync(`${out}/${name}.png`, Buffer.from(r.result.data, 'base64'));
      const w = (await page.eval('[document.documentElement.scrollWidth, window.innerWidth]')).result.result.value;
      console.log('saved', `${out}/${name}.png`, w[0] > w[1] ? `HORIZONTAL OVERFLOW ${w[0]}>${w[1]}` : `no overflow (${w[1]}px)`);
    },
    close: async () => {
      ws.close(); proc.kill();
      await new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r)));
      rmSync(dir, { recursive: true, force: true }); // only the profile this run created
    },
  };
  return page;
}

const p = await browser(['--use-fake-ui-for-media-stream']);
await p.size(1280, 900);
await p.go('/');
await p.shot('01-creator-draft', true);
await p.eval(`document.querySelectorAll('.review input').forEach((i) => i.click())`);
await sleep(300);
await p.click('Approve version 1');
await p.shot('02-creator-approved');

await p.size(390, 844, true);
await p.go('/follow/demo-route');
await p.shot('03-guide-start');
await p.click('Unrelated view (not on this route)');
await p.shot('04-guide-uncertain');
await p.click('Entrance, facing unclear');
await p.shot('05-guide-reorient');
await p.click('Entrance, approached as recorded');
await p.click('Blue mural, approached as recorded');
await p.shot('06-guide-guiding');
await p.click('Recognizer failure');
await p.shot('07-guide-provider-error');
await p.click('Español');
await p.shot('08-guide-spanish-same-position');
await p.click('Activar cámara');
await sleep(800);
await p.shot('09-guide-camera-on-fake-device');
await p.click('Room 204, approached as recorded');
await p.shot('10-guide-arrived');
await p.size(1280, 900);
await p.shot('11-guide-desktop', true);
await p.close();

const d = await browser(['--deny-permission-prompts']);
await d.size(390, 844, true);
await d.go('/follow/demo-route');
await d.click('Start camera');
await sleep(800);
await d.shot('12-guide-camera-denied');
await d.close();
process.exit(0);
