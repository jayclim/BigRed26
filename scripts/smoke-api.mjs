// HTTP smoke test: `npm run build && node scripts/smoke-api.mjs [port]`. Starts its own server on a
// throwaway data file (scripts/isolated-server.mjs), walks draft -> approve -> session -> frames -> locale.
import assert from 'node:assert/strict';
import { startIsolatedServer } from './isolated-server.mjs';

const { base } = await startIsolatedServer(Number(process.argv[2] ?? 3107));
const call = async (method, path, body) => {
  const res = await fetch(base + path, {
    method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  console.log(method.padEnd(5), path.padEnd(48), res.status, json.ok ? (json.value?.state ?? json.value?.status ?? 'ok') : json.error.code);
  return { status: res.status, ...json };
};

const route = (await call('GET', '/api/routes/demo-route')).value;
assert.equal(route.status, 'draft');
assert.equal((await call('POST', '/api/sessions', { routeId: 'demo-route', locale: 'en', mode: 'mock' })).status, 409);
assert.equal((await call('PUT', '/api/routes/demo-route/draft', { ...route, version: 'x' })).status, 400);
const edited = { ...route, checkpoints: route.checkpoints.map((c) => c.id === 'mural' ? { ...c, instruction: { ...c.instruction, en: 'Turn left at the blue mural.' } } : c) };
assert.equal((await call('PUT', '/api/routes/demo-route/draft', edited)).status, 200);
assert.equal((await call('POST', '/api/routes/demo-route/approve', { version: 1, reviewedCheckpointIds: ['entrance'] })).status, 409);
const ids = route.checkpoints.map((c) => c.id);
assert.equal((await call('POST', '/api/routes/demo-route/approve', { version: 1, reviewedCheckpointIds: ids })).value.status, 'approved');
assert.equal((await call('POST', '/api/sessions', { routeId: 'demo-route', locale: 'en', mode: 'live' })).status, 503);

const s = (await call('POST', '/api/sessions', { routeId: 'demo-route', locale: 'en', mode: 'mock' })).value;
const frame = async (mediaId) => {
  const { sequence, routeVersion } = (await call('POST', `/api/sessions/${s.id}/frame-sequence`, {})).value;
  return call('POST', `/api/sessions/${s.id}/frame`, { sessionId: s.id, routeVersion, sequence, capturedAt: new Date().toISOString(), mediaId });
};
assert.equal((await frame('mock:unrelated')).value.direction, null);
assert.equal((await frame('mock:entrance:unknown-approach')).value.state, 'reorient');
assert.equal((await frame('mock:entrance:approach')).value.direction, 'forward');
assert.equal((await frame('mock:mural:approach')).value.text, 'Turn left at the blue mural.');
assert.equal((await frame('mock:provider-error')).status, 503);
await call('PATCH', `/api/sessions/${s.id}/locale`, { locale: 'es' });
const es = (await call('GET', `/api/sessions/${s.id}/guidance`)).value;
assert.deepEqual([es.state, es.checkpointId, es.direction, es.locale], ['guiding', 'mural', 'left', 'es']);
assert.equal((await frame('mock:destination:approach')).value.text, 'Has llegado a la sala 204.');
assert.equal((await call('POST', `/api/sessions/${s.id}/frame`, { sessionId: s.id, routeVersion: 1, sequence: 1, capturedAt: new Date().toISOString(), mediaId: 'mock:unrelated' })).status, 409);
console.log('smoke passed');
process.exit(0);
