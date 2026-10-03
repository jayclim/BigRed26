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

const actionRouteId = 'action-fixture';
const actionRoute = (await call('GET', `/api/routes/${actionRouteId}`)).value;
const actionCheckpointIds = actionRoute.checkpoints.map((c) => c.id);
assert.equal((await call('POST', `/api/routes/${actionRouteId}/approve`, {
  version: actionRoute.version, reviewedCheckpointIds: actionCheckpointIds,
})).value.status, 'approved');
const actionSession = (await call('POST', '/api/sessions', {
  routeId: actionRouteId, locale: 'en', mode: 'mock',
})).value;
const reserveActionSequence = async () => (await call('POST', `/api/sessions/${actionSession.id}/frame-sequence`, {})).value;
const completeAction = (body) => call('POST', `/api/sessions/${actionSession.id}/complete-action`, body);
const inactiveSequence = await reserveActionSequence();
const inactiveCompletion = await completeAction({
  routeVersion: inactiveSequence.routeVersion, sequence: inactiveSequence.sequence, checkpointId: 'elevator',
});
assert.deepEqual([inactiveCompletion.status, inactiveCompletion.error.code], [400, 'INVALID_INPUT']);

const actionFrame = async (mediaId) => {
  const { sequence, routeVersion } = await reserveActionSequence();
  return call('POST', `/api/sessions/${actionSession.id}/frame`, {
    sessionId: actionSession.id, routeVersion, sequence, capturedAt: new Date().toISOString(), mediaId,
  });
};
const similarDoor = await actionFrame('mock:door-b214:similar-door');
assert.equal(similarDoor.value.checkpointId, null); // B215 evidence must not select B214.
const activeAction = await actionFrame('mock:door-b214:approach');
assert.deepEqual([activeAction.value.state, activeAction.value.checkpointId, activeAction.value.direction], [
  'guiding', 'door-b214', null,
]);

const staleVersionSequence = await reserveActionSequence();
const staleVersion = await completeAction({
  routeVersion: staleVersionSequence.routeVersion + 1,
  sequence: staleVersionSequence.sequence,
  checkpointId: 'door-b214',
});
assert.deepEqual([staleVersion.status, staleVersion.error.code], [409, 'STALE_VERSION']);
const validCompletion = await reserveActionSequence();
const completionRequest = {
  routeVersion: validCompletion.routeVersion,
  sequence: validCompletion.sequence,
  checkpointId: 'door-b214',
};
const completed = await completeAction(completionRequest);
assert.equal(completed.status, 200);
assert.ok(completed.value.evidence.some((e) => e.includes('Manual')));
assert.notEqual(completed.value.state, 'guiding');
assert.equal(completed.value.direction, null);
const repeatedCompletion = await completeAction(completionRequest);
assert.deepEqual([repeatedCompletion.status, repeatedCompletion.error.code], [409, 'STALE_FRAME']);
console.log('smoke passed');
process.exit(0);
