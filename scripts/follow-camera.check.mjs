import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCore, emptyState } from '../src/server/core/core.ts';
import { startIsolatedServer } from './isolated-server.mjs';
process.on('uncaughtException', (error) => { console.error('FAIL follow camera:', error.message); process.exit(1); });
const fixture = JSON.parse(readFileSync('contracts/fixture.v1.json', 'utf8')).route;
const { base } = await startIsolatedServer(Number(process.argv[2] ?? 3120));
const out = mkdtempSync(join(tmpdir(), 'breadcrumb-follow-shots-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (value) => ({ ok: true, value });
let observation = 'target', uploads = 0, matches = 0, pendingRelease;
const core = createCore({ state: emptyState(), recognizers: { live: async (route) => {
  matches++;
  const observed = observation;
  await new Promise((r) => { pendingRelease = r; });
  pendingRelease = undefined;
  return observed === 'unknown' ? ok({ kind: 'unknown', evidence: [] })
    : ok({ kind: 'checkpoint', checkpointId: route.checkpoints[0].id, approachConfirmed: true, evidence: ['Synthetic entrance'] });
} } });
assert((await core.saveDraft({ ...fixture, status: 'draft' })).ok);
assert((await core.approveRoute(fixture.id, 1, fixture.checkpoints.map((c) => c.id))).ok);
async function browser(denied = false) {
  const profile = mkdtempSync(join(tmpdir(), 'breadcrumb-follow-chrome-'));
  const proc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--use-fake-device-for-media-stream', denied ? '--deny-permission-prompts' : '--use-fake-ui-for-media-stream', 'about:blank'], { stdio: 'ignore' });
  process.once('exit', () => { proc.kill(); rmSync(profile, { recursive: true, force: true }); });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(100);
    try {
      const port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  assert(target, 'Chrome CDP target unavailable');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0; const waiting = new Map(); let intercept = false; let failure;
  const send = (method, params = {}) => new Promise((resolve, reject) => { waiting.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  async function paused(event) {
    if (!intercept) return send('Fetch.continueRequest', { requestId: event.requestId });
    const url = new URL(event.request.url), path = url.pathname;
    let result;
    const body = () => JSON.parse(event.request.postData ?? '{}');
    if (path === '/api/sessions') { const b = body(); result = await core.startSession(b.routeId, b.locale, b.mode); }
    else if (path.startsWith('/api/routes/')) result = await core.getRoute(decodeURIComponent(path.split('/')[3]), Number(url.searchParams.get('version')) || undefined);
    else if (path === '/api/frames') { uploads++; assert.equal(event.request.headers['Content-Type'] ?? event.request.headers['content-type'], 'image/jpeg'); result = ok({ mediaId: `frame_${randomUUID()}` }); }
    else {
      const [, , , sessionId, action] = path.split('/');
      if (action === 'frame-sequence') result = await core.reserveFrameSequence(sessionId);
      else if (action === 'frame') result = await core.matchFrame(body());
      else if (action === 'locale') result = await core.setLocale(sessionId, body().locale);
      else if (action === 'guidance') result = await core.currentGuidance(sessionId);
      else result = await core.getSession(sessionId);
    }
    await send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: result.ok ? 200 : result.error.code === 'STALE_FRAME' ? 409 : 503, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(result)).toString('base64') });
  }
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id) { const w = waiting.get(m.id); waiting.delete(m.id); if (m.error) w?.reject(new Error(m.error.message)); else w?.resolve(m.result); }
    else if (m.method === 'Fetch.requestPaused') paused(m.params).catch((e) => { failure = e; });
  });
  const evaluate = async (expression) => { if (failure) throw failure; const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  const wait = async (expression) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(50); } throw new Error(`Timed out: ${expression}`); };
  const click = (text, twice = false) => evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b) throw Error('Missing button'); b.click(); ${twice ? 'b.click();' : ''} })()`);
  return {
    send, evaluate, wait, click,
    size: (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 }),
    go: async (query = '') => { await send('Page.navigate', { url: base + '/follow/demo-route' + query }); await wait("!!document.querySelector('.card')"); },
    live: async () => { intercept = true; await send('Fetch.enable', { patterns: ['/api/sessions*', '/api/routes/*', '/api/frames*'].map((p) => ({ urlPattern: '*' + p })) }); },
    shot: async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, name + '.png'), Buffer.from(r.data, 'base64')); },
    close: async () => { ws.close(); proc.kill(); await new Promise((r) => proc.exitCode !== null ? r() : proc.once('exit', r)); rmSync(profile, { recursive: true, force: true }); },
  };
}
const approved = await fetch(base + '/api/routes/demo-route/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 1, reviewedCheckpointIds: fixture.checkpoints.map((c) => c.id) }) }); assert((await approved.json()).ok);
const p = await browser();
try {
  for (const [width, height] of [[390, 844], [1280, 800]]) {
    await p.size(width, height); await p.go();
    assert(await p.evaluate("document.querySelector('.stage-label').textContent.includes('Mock') && !!document.querySelector('.mock-panel')"));
    await p.click('Entrance, approached as recorded'); await p.wait("document.querySelector('.card').dataset.state === 'guiding'");
    await p.shot(`mock-${width}`);
  }
  console.log('PASS mobile/desktop default mock badge, panel and pick');
  for (const mode of ['live', 'replay']) {
    await p.send('Page.navigate', { url: base + '/follow/demo-route?mode=' + mode });
    await p.wait("!!document.querySelector('[role=alert]')");
    assert(await p.evaluate("document.querySelector('[role=alert]').textContent.includes('not available') && !document.querySelector('.mock-panel')"));
  }
  console.log('PASS production live/replay fail honestly without mock fallback');
  await p.live();
  for (const [width, height] of [[390, 844], [1280, 800]]) {
    const sessionsBefore = Object.keys(core.state.sessions).length;
    await p.size(width, height); await p.go('?mode=live');
    assert.equal(Object.keys(core.state.sessions).length, sessionsBefore + 1, 'Strict Mode starts one session');
    assert(await p.evaluate("document.querySelector('.stage-label').textContent.includes('Live') && !document.querySelector('.mock-panel')"));
    // Use real CDP keyboard input to reach and activate camera controls.
    for (let i = 0; i < 20; i++) {
      if (await p.evaluate("document.activeElement?.textContent === 'Start camera'")) break;
      await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    }
    assert(await p.evaluate("document.activeElement?.textContent === 'Start camera'"));
    await p.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await p.wait("[...document.querySelectorAll('button')].some(b => b.textContent === 'Check this view') && document.querySelector('video').videoWidth > 0");
    assert(await p.evaluate(`(() => {
      const check = [...document.querySelectorAll('button')].find(b => b.textContent === 'Check this view').getBoundingClientRect();
      const label = document.querySelector('.stage-label').getBoundingClientRect();
      const stop = document.querySelector('.cam-stop').getBoundingClientRect();
      const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      return !intersects(check, label) && !intersects(check, stop);
    })()`), `Camera controls overlap at ${width}x${height}`);
    const before = uploads;
    for (let i = 0; i < 20; i++) {
      if (await p.evaluate("document.activeElement?.textContent === 'Check this view'")) break;
      await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    }
    assert(await p.evaluate("document.activeElement?.textContent === 'Check this view'"));
    await p.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await p.click('Check this view', true);
    for (let i = 0; i < 100 && !pendingRelease; i++) await sleep(50);
    assert(pendingRelease); assert.equal(uploads, before + 1);
    assert(await p.evaluate("[...document.querySelectorAll('button')].find(b => b.textContent === 'Check this view').disabled"));
    pendingRelease(); await p.wait("document.querySelector('.card').dataset.state === 'guiding' && document.querySelector('.card').getAttribute('aria-busy') === 'false'");
    assert(await p.evaluate(`document.querySelector('.say').textContent === ${JSON.stringify(fixture.checkpoints[0].instruction.en)}`));
    assert(await p.evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
    await p.shot(`live-${width}`);
    const session = Object.values(core.state.sessions).at(-1).session;
    const position = { id: session.lastConfirmedCheckpointId, sequence: session.lastAcceptedSequence };
    await p.click('Español'); await p.wait("document.querySelector('main').lang === 'es' && document.querySelector('.card').getAttribute('aria-busy') === 'false'");
    assert.deepEqual({ id: session.lastConfirmedCheckpointId, sequence: session.lastAcceptedSequence }, position);
    await p.click('English'); await p.wait("document.querySelector('main').lang === 'en' && document.querySelector('.card').getAttribute('aria-busy') === 'false'");
    observation = 'unknown'; await p.click('Check this view');
    for (let i = 0; i < 100 && !pendingRelease; i++) await sleep(50);
    assert(pendingRelease); pendingRelease(); await p.wait("document.querySelector('.card').dataset.state === 'uncertain' && document.querySelector('.card').getAttribute('aria-busy') === 'false'");
    assert(await p.evaluate("document.querySelector('.card').dataset.arrow === 'none'"));
    observation = 'target'; await p.click('Check this view');
    for (let i = 0; i < 100 && !pendingRelease; i++) await sleep(50);
    assert(pendingRelease); await p.click('Stop camera');
    assert(await p.evaluate("document.querySelector('video').srcObject === null"));
    pendingRelease();
    await p.wait("document.querySelector('.card').dataset.state === 'guiding' && document.querySelector('.card').getAttribute('aria-busy') === 'false'");
    assert.equal(await p.evaluate("Number(document.querySelector('.card').dataset.sequence)"), session.lastAcceptedSequence);
    assert.equal(session.lastConfirmedCheckpointId, fixture.checkpoints[0].id);
    assert(await p.evaluate(`document.querySelector('.say').textContent === ${JSON.stringify(fixture.checkpoints[0].instruction.en)}`));
  }
  console.log('PASS mobile/desktop live label, one upload per double click, busy button, core guidance');
  console.log('PASS locale preserves cursor, unknown removes arrow, stop keeps late accepted result and clears stream');
  console.log('PASS controls do not overlap at 390x844 and 1280x800; keyboard Tab and Enter activate Start camera and Check this view');
} finally { await p.close(); }
const d = await browser(true);
try {
  await d.live(); await d.size(390, 844); await d.go('?mode=live'); await d.click('Start camera');
  await d.wait("[...document.querySelectorAll('button')].some(b => b.textContent === 'Try again')");
  assert(await d.evaluate("document.querySelector('.placeholder[role=alert]').textContent.includes('blocked')"));
  await d.shot('denied'); console.log('PASS denied camera alert and Try again');
} finally { await d.close(); }
console.log(`PASS ${uploads} synthetic uploads, ${matches} recognitions; screenshots ${out}`);
process.exit(0);
