// Browser CoreAdapter that talks to the local API. Screens receive this as a prop.
import type { CoreAdapter, Result } from '@contracts/contracts.ts';

async function call<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: "Can't reach the Breadcrumb server.", retryable: true } };
  }
  try {
    return (await res.json()) as Result<T>;
  } catch {
    return { ok: false, error: { code: res.status === 404 ? 'NOT_FOUND' : 'PROVIDER_UNAVAILABLE', message: `Unexpected ${res.status} response from ${path}.`, retryable: res.status >= 500 } };
  }
}
const e = encodeURIComponent;

export const httpCore: CoreAdapter = {
  startBuild: (videoId, name) => call('POST', '/api/routes/build', { videoId, name }),
  getBuild: (jobId) => call('GET', `/api/builds/${e(jobId)}`),
  getRoute: (id, version) => call('GET', `/api/routes/${e(id)}${version ? `?version=${version}` : ''}`),
  saveDraft: (route) => call('PUT', `/api/routes/${e(route.id)}/draft`, route),
  approveRoute: (id, version, reviewedCheckpointIds) => call('POST', `/api/routes/${e(id)}/approve`, { version, reviewedCheckpointIds }),
  startSession: (routeId, locale, mode) => call('POST', '/api/sessions', { routeId, locale, mode }),
  getSession: (id) => call('GET', `/api/sessions/${e(id)}`),
  setLocale: (id, locale) => call('PATCH', `/api/sessions/${e(id)}/locale`, { locale }),
  reserveFrameSequence: (id) => call('POST', `/api/sessions/${e(id)}/frame-sequence`, {}),
  matchFrame: (frame) => call('POST', `/api/sessions/${e(frame.sessionId)}/frame`, frame),
  currentGuidance: (id) => call('GET', `/api/sessions/${e(id)}/guidance`),
  routeQuality: (id, version, since, mode) =>
    call('GET', `/api/routes/${e(id)}/quality?version=${version}&since=${e(since)}&mode=${mode}`),
};
