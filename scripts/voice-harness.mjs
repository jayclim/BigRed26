import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fixtureServer, request } from './voice-fixture.mjs';
const { base, audio } = await fixtureServer(3119);
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Voice transport test</title>
<body><h1>TEST CLIP - generated tone, not ElevenLabs</h1><p>This checks local transport and playback only.</p><button id="play">Play test clip</button><p id="result" role="status">Ready</p>
<script>let player; document.getElementById('play').onclick = async () => {
const result = document.getElementById('result'); result.textContent = 'Loading';
try { const response = await fetch('/api/speech', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${JSON.stringify(request)})});
const clip = await response.json(); if(!clip.ok) throw new Error(clip.error.message);
if(player) player.pause(); player = new Audio(clip.value.audioUrl);
player.onended = () => result.textContent = 'Playback completed'; player.onerror = () => result.textContent = 'Playback failed';
await player.play(); result.textContent = 'Playback started'; } catch(e) { result.textContent = 'Playback failed: ' + e.message; }
};</script></body></html>`;
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return; }
    if (!/^\/api\/speech(?:\/[a-f0-9]{64})?$/.test(req.url ?? '')) { res.writeHead(404); res.end(); return; }
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 8192) { res.writeHead(400); res.end(); return; } chunks.push(chunk); }
    const response = await fetch(base + req.url, { method: req.method, headers: { 'content-type': 'application/json' },
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/octet-stream' });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(502); res.end('Local proxy failed'); }
});
await new Promise((resolve) => server.listen(3120, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:3120';
console.log(`Voice harness: ${url}\nTEST CLIP - generated tone, not ElevenLabs\nClick Play test clip. Ctrl+C stops this harness.`);
process.on('SIGINT', () => process.exit(0)); process.on('SIGTERM', () => process.exit(0));
if (process.argv.includes('--once')) {
  assert.match(await (await fetch(url)).text(), /new Audio/);
  const response = await fetch(`${url}/api/speech`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.value.cached, true);
  const delivered = await fetch(url + result.value.audioUrl); assert.equal(delivered.headers.get('content-type'), audio.contentType);
  assert.deepEqual(Buffer.from(await delivered.arrayBuffer()), audio.bytes);
  console.log('voice harness --once passed (HTTP only; browser playback unverified)'); process.exit(0);
}
