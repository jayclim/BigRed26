// One real Gemini Live session from Node, using an ephemeral token. Costs a few cents; run by hand, never in `npm run check`.
// Usage: node scripts/live-guide-smoke.mjs <env-file> <store.json> <routeId> <frame.jpg>... [--proactive]
// The long-lived key is read from the env file and used only in the token request. Nothing secret is printed.
import { readFileSync } from 'node:fs';
import { mintLiveToken } from '../src/server/live/liveGuide.ts';

const [envFile, storeFile, routeId, ...rest] = process.argv.slice(2);
const proactive = rest.includes('--proactive');
const framesOnly = rest.includes('--frames-only'); // no text turns: does video alone make the model speak?
const frames = rest.filter((a) => a.endsWith('.jpg'));
const key = readFileSync(envFile, 'utf8').match(/^GEMINI_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
if (!key) throw new Error('GEMINI_API_KEY not found in env file');
const route = JSON.parse(readFileSync(storeFile, 'utf8')).routes[routeId].at(-1);
const minted = await mintLiveToken({ routeId, locale: 'en' }, { core: { getRoute: async () => ({ ok: true, value: route }) }, config: { enabled: '1', apiKey: key } });
if (!minted.ok) { console.log('TOKEN FAIL', minted.error.code, minted.error.message); process.exit(1); }
const live = minted.value;
console.log('token minted; model', live.model, '; setup chars', JSON.stringify(live.setup).length);
const setup = proactive ? { ...live.setup, proactivity: { proactiveAudio: true } } : live.setup;

const t0 = performance.now(); const ms = () => Math.round(performance.now() - t0);
const ws = new WebSocket(`${live.endpoint}?access_token=${encodeURIComponent(live.token)}`);
const stats = { audioChunks: 0, audioBytes: 0, out: '', inp: '', turns: 0, firstAudio: null, firstAudioAfterText: null, closed: null, goAway: false, other: [] };
let textAt = 0; let setupAt = 0;
const send = (m) => ws.send(JSON.stringify(m));
const done = new Promise((resolve) => {
  ws.onclose = (e) => { stats.closed = { code: e.code, reason: String(e.reason).slice(0, 200) }; resolve(); };
  ws.onerror = () => { stats.other.push('error event'); };
  ws.onmessage = async (event) => {
    const raw = typeof event.data === 'string' ? event.data : Buffer.from(await event.data.arrayBuffer()).toString();
    const m = JSON.parse(raw);
    if (m.setupComplete) { setupAt = ms(); console.log(`[${ms()}ms] setupComplete`); void run(); }
    const sc = m.serverContent;
    if (sc?.modelTurn) for (const p of sc.modelTurn.parts ?? []) if (p.inlineData?.data) {
      stats.audioChunks++; stats.audioBytes += Buffer.from(p.inlineData.data, 'base64').length;
      stats.firstAudio ??= ms(); if (textAt) stats.firstAudioAfterText ??= ms() - textAt;
      if (stats.audioChunks === 1) console.log(`[${ms()}ms] first audio, mime ${p.inlineData.mimeType}`);
    }
    if (sc?.outputTranscription?.text) stats.out += sc.outputTranscription.text;
    if (sc?.inputTranscription?.text) stats.inp += sc.inputTranscription.text;
    if (sc?.turnComplete) { stats.turns++; console.log(`[${ms()}ms] turnComplete`); }
    if (m.goAway) stats.goAway = true;
    if (m.usageMetadata) stats.usage = m.usageMetadata;
    if (!m.setupComplete && !sc && !m.usageMetadata) stats.other.push(raw.slice(0, 100));
  };
});
ws.onopen = () => send({ setup });
const sleep = (n) => new Promise((r) => setTimeout(r, n));
async function run() {
  if (framesOnly) {
    textAt = ms();
    for (let i = 0; i < 16; i++) { send({ realtimeInput: { video: { data: readFileSync(frames[Math.min(i, frames.length - 1)]).toString('base64'), mimeType: 'image/jpeg' } } }); await sleep(1000); }
    ws.close(1000); return;
  }
  for (const f of frames) { send({ realtimeInput: { video: { data: readFileSync(f).toString('base64'), mimeType: 'image/jpeg' } } }); await sleep(1000); }
  textAt = ms();
  send({ realtimeInput: { text: '[start] The walk is starting now. Look at the camera and tell the person the first instruction in one short sentence.' } });
  console.log(`[${ms()}ms] sent ${frames.length} frames + start text`);
  await sleep(9000);
  send({ realtimeInput: { video: { data: readFileSync(frames.at(-1)).toString('base64'), mimeType: 'image/jpeg' } } });
  const before = stats.audioChunks; textAt = ms();
  send({ realtimeInput: { text: process.env.TICK_TEXT ?? '[tick] Check the latest frames. Speak only if guidance changed or the person seems stuck.' } });
  await sleep(8000);
  stats.tickAudioChunks = stats.audioChunks - before;
  ws.close(1000);
}
await Promise.race([done, sleep(45000)]);
if (ws.readyState < 2) ws.close();
stats.other = [...new Set(stats.other)].slice(0, 5);
console.log(JSON.stringify({ ...stats, outputTranscript: stats.out, inputTranscript: stats.inp, out: undefined, inp: undefined }, null, 1));
