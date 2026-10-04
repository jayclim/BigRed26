// Captures UI state screenshots with local Chrome over CDP (no test deps):
//   npm run build && node scripts/screenshots.mjs [port] [chromePath]
// Starts its own server on a throwaway data file (scripts/isolated-server.mjs); your .data/ is never touched.
// Uses Chrome's fake camera device.
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

// The isolated server seeds the fictional test route demo-route (BREADCRUMB_TEST_FIXTURES=1), so the creator shots have a route.
const p = await browser(['--use-fake-ui-for-media-stream']);
await p.size(1280, 900);
await p.go('/teach?route=demo-route');
await p.shot('01-creator-draft', true);
await p.click('Approve version 1');
await p.shot('02-creator-approved');

// The landing page: hero, then the route and bounty dashboard. /teach with no route starts a new route from a video.
await p.go('/');
await p.shot('06-landing-desktop');
await p.eval(`document.querySelector('#routes').scrollIntoView({ behavior: 'instant' })`);
await sleep(300);
await p.shot('07-dashboard-desktop');
await p.size(390, 844, true);
await p.go('/');
await p.shot('08-landing-mobile', true);
await p.go('/teach');
await p.shot('09-teach-new-mobile', true);

// /follow/<id> opens the Gemini Live voice guide. Live stays disabled here (no Gemini key), so this is its honest "not enabled" state.
await p.size(390, 844, true);
await p.go('/follow/demo-route');
await p.shot('03-voice-guide-mobile');
await p.size(1280, 900);
await p.shot('04-voice-guide-desktop', true);
// ?mode=live is the camera check-view guide. Without a live recognizer it fails honestly; there is no fallback.
await p.size(390, 844, true);
await p.go('/follow/demo-route?mode=live');
await p.shot('05-check-view-unavailable');
await p.close();
process.exit(0);
