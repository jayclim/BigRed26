// Real end-to-end check of the Live guide in headless Chrome with a fake camera. Uses ONE paid Gemini Live session.
// Usage: npm run build && node scripts/live-guide-browser.mjs <env-file> <store.json> <routeId> <video.y4m> [port]
// The server child gets the key through its environment. Nothing secret is printed or written.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [envFile, storeFile, routeId, y4m, portArg] = process.argv.slice(2);
const port = Number(portArg ?? 3140);
const key = readFileSync(envFile, 'utf8').match(/^GEMINI_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!key) throw new Error('GEMINI_API_KEY not found');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = mkdtempSync(join(tmpdir(), 'breadcrumb-live-e2e-'));
const store = JSON.parse(readFileSync(storeFile, 'utf8'));
writeFileSync(join(dir, 'store.json'), JSON.stringify({ routes: { [routeId]: store.routes[routeId] }, sessions: {}, events: [] }));
const server = spawn('node_modules/.bin/next', ['start', '-p', String(port)], {
  env: { ...process.env, BREADCRUMB_DATA_FILE: join(dir, 'store.json'), BREADCRUMB_GEMINI_LIVE: '1', GEMINI_API_KEY: key }, stdio: ['ignore', 'pipe', 'inherit'] });
let ready = false; server.stdout.on('data', (c) => { ready ||= String(c).includes('Ready in'); });
const profile = mkdtempSync(join(tmpdir(), 'breadcrumb-live-chrome-'));
let chrome;
const cleanup = () => { server.kill(); chrome?.kill(); rmSync(dir, { recursive: true, force: true }); rmSync(profile, { recursive: true, force: true }); };
process.on('exit', cleanup);
for (let i = 0; !ready && i < 100; i++) await sleep(200);
const base = `http://localhost:${port}`;
chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`, '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(100); try { const p = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); target = (await (await fetch(`http://127.0.0.1:${p}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiting = new Map(); const logs = [];
const send = (method, params = {}) => new Promise((resolve, reject) => { waiting.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id) { const w = waiting.get(m.id); waiting.delete(m.id); m.error ? w?.reject(new Error(m.error.message)) : w?.resolve(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') logs.push('exception ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 200)); });
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? '')); return r.result.value; };
await send('Runtime.enable'); await send('Page.enable');
// Count audio buffers scheduled and WebSocket frames sent, without touching their content.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__e2e = { audioStarts: 0, audioSeconds: 0, sent: { video: 0, text: 0, audio: 0, setup: 0 }, closes: [] };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { window.__e2e.audioStarts++; window.__e2e.audioSeconds += this.buffer ? this.buffer.duration : 0; return start.apply(this, a); };
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { try { const m = JSON.parse(d); if (m.setup) window.__e2e.sent.setup++; const r = m.realtimeInput; if (r?.video) window.__e2e.sent.video++; if (r?.text) window.__e2e.sent.text++; if (r?.audio) window.__e2e.sent.audio++; } catch {} return send.call(this, d); };
  const Orig = WebSocket; ` });
const results = {};
await send('Page.navigate', { url: `${base}/follow/${routeId}?mode=stream` });
for (let i = 0; i < 100; i++) { if (await evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Start live guide' && !b.disabled)`)) break; await sleep(100); }
results.startEnabled = await evaluate(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Start live guide' && !b.disabled)`);
// The token endpoint must not expose the long-lived key. Mint one extra token (free) and search the body.
results.tokenBodyHasKey = await evaluate(`fetch('/api/live/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({routeId:${JSON.stringify(routeId)},locale:'en'})}).then(r=>r.text()).then(t=>t.includes(${JSON.stringify(key)}))`);
const t0 = Date.now();
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Start live guide').click()`);
let firstCaptionAt = null, firstAudioAt = null;
for (let i = 0; i < 380; i++) { // about 38 s
  await sleep(100);
  const s = await evaluate(`({ a: window.__e2e.audioStarts, c: [...document.querySelectorAll('ul[aria-label="Guide captions"] li')].map(l => l.textContent).join(' | '), st: document.querySelector('[role=status]')?.textContent ?? '', alert: document.querySelector('[role=alert]')?.textContent ?? '', badge: !!document.querySelector('[aria-label="Live, Gemini"]') })`);
  if (s.a > 0 && firstAudioAt === null) firstAudioAt = Date.now() - t0;
  if (s.c && !s.c.includes('will speak') && firstCaptionAt === null) firstCaptionAt = Date.now() - t0;
  results.last = s;
  if (s.alert) break;
}
results.firstAudioMs = firstAudioAt; results.firstCaptionMs = firstCaptionAt;
results.e2e = await evaluate('window.__e2e');
results.videoEl = await evaluate(`(() => { const v = document.querySelector('video'); return { w: v.videoWidth, h: v.videoHeight, hidden: v.hidden }; })()`);
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Stop').click()`);
await sleep(500);
results.afterStop = await evaluate(`({ status: document.querySelector('[role=status]')?.textContent, tracksLive: (document.querySelector('video').srcObject?.getTracks() ?? []).filter(t => t.readyState === 'live').length })`);
results.logs = logs;
console.log(JSON.stringify(results, null, 1));
ws.close(); cleanup(); process.exit(0);
