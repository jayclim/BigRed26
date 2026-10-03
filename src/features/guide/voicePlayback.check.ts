import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Guidance, Result, SpeechClip, SpeechRequest, VoiceAdapter } from '../../../contracts/contracts.ts';
import { createVoicePlayer, DEFAULT_VOICE_ID, type AudioLike, type VoiceStatus } from './voicePlayback.ts';

const guidance = (instructionId = 'A', locale: 'en' | 'es' = 'en', text = '  Turn left.\nKeep B214.  ', sequence = 1, sessionId = 'session'): Guidance => ({
  instructionId, locale, text, sequence, sessionId, routeVersion: 1, mode: 'mock',
  state: 'uncertain', checkpointId: null, direction: null, approachConfirmed: false, evidence: [], processingMs: 0,
});
const clip = (url: string): Result<SpeechClip> => ({ ok: true, value: { audioUrl: url, provider: 'elevenlabs', cached: false } });
const fail: Result<SpeechClip> = { ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: 'Private provider body', retryable: true } };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function harness(synthesize: VoiceAdapter['synthesize'] = async (r) => clip(r.instructionId), rejectPlay = false) {
  const requests: SpeechRequest[] = [];
  const audios: Array<AudioLike & { plays: number; pauses: number }> = [];
  const statuses: VoiceStatus[] = [];
  const voice: VoiceAdapter = { synthesize: (r) => { requests.push(r); return synthesize(r); } };
  const player = createVoicePlayer({
    createAudio: (src) => {
      const audio = { src, plays: 0, pauses: 0,
        async play() { this.plays++; if (rejectPlay) throw new Error('Private audio error'); },
        pause() { this.pauses++; },
      };
      audios.push(audio); return audio;
    }, onStatus: (s) => statuses.push(s),
  });
  return { player, voice, requests, audios, statuses };
}
{
  const h = harness(); const g = guidance();
  await h.player.speak(h.voice, g); await h.player.speak(h.voice, g); await h.player.speak(h.voice, { ...g, sequence: 2 });
  assert.equal(h.requests.length, 1); assert.equal(h.audios[0].plays, 1);
  assert.deepEqual(h.requests[0], { text: g.text, locale: g.locale, instructionId: g.instructionId, voiceId: DEFAULT_VOICE_ID });
  // Like browser speech, only the current instruction is deduplicated: A, B, A speaks A again.
  await h.player.speak(h.voice, guidance('B')); await h.player.speak(h.voice, g);
  assert.equal(h.requests.length, 3);
  console.log('PASS duplicate instructions and exact request fields');
}
{
  const h = harness(); const requestsY: SpeechRequest[] = [];
  const voiceY: VoiceAdapter = { synthesize: async (r) => { requestsY.push(r); return clip('Y'); } };
  await h.player.speak(h.voice, guidance());
  await h.player.speak(voiceY, guidance('A', 'en', guidance().text, 2));
  assert.equal(h.requests.length + requestsY.length, 1);
  assert.equal(h.audios.length, 1); assert.equal(h.audios[0].pauses, 0);
  assert.equal(h.audios[0].plays, 1); assert.equal(h.audios[0].src, 'A');
  await h.player.speak(voiceY, guidance('B'));
  assert.equal(h.requests.length, 1); assert.equal(requestsY.length, 1);
  assert.equal(requestsY[0].instructionId, 'B');
  console.log('PASS adapter replacement keeps current audio and sends new instruction to Y');
}
{
  const slow = deferred<Result<SpeechClip>>(); const h = harness(() => slow.promise);
  const requestsY: SpeechRequest[] = [];
  const voiceY: VoiceAdapter = { synthesize: async (r) => { requestsY.push(r); return clip('B'); } };
  const old = h.player.speak(h.voice, guidance());
  await h.player.speak(voiceY, guidance('B')); slow.resolve(clip('A')); await old;
  assert.equal(h.requests.length, 1); assert.equal(requestsY.length, 1);
  assert.equal(h.audios.length, 1); assert.equal(h.audios[0].src, 'B');
  assert.equal(h.audios[0].plays, 1);
  console.log('PASS late A from X never plays after instruction B through Y');
}
{
  const h = harness(); await h.player.speak(h.voice, guidance()); h.player.stop();
  assert.equal(h.audios[0].pauses, 1); assert.equal(h.audios[0].src, '');
  await h.player.speak(h.voice, guidance()); await h.player.speak(h.voice, guidance()); assert.equal(h.requests.length, 2);
  const slow = deferred<Result<SpeechClip>>(); const pending = harness(() => slow.promise);
  const task = pending.player.speak(pending.voice, guidance()); pending.player.stop(); slow.resolve(clip('late')); await task;
  assert.equal(pending.audios.length, 0); assert.equal(pending.statuses.at(-1), null);
  await pending.player.speak(pending.voice, guidance()); assert.equal(pending.audios.length, 1);
  console.log('PASS mute, late synthesis cancellation and re-enable');
}
{
  const h = harness(); await h.player.speak(h.voice, guidance()); await h.player.speak(h.voice, guidance('A', 'es', 'Gira a la izquierda.'));
  assert.equal(h.requests[1].locale, 'es'); assert.equal(h.requests.length, 2);
  assert.equal(h.audios[0].pauses, 1); assert.equal(h.audios[0].src, ''); assert.equal(h.audios[1].plays, 1);
  console.log('PASS locale switch requests Spanish and cancels English audio');
}
{
  const slow = deferred<Result<SpeechClip>>(); const h = harness((r) => r.instructionId === 'A' ? slow.promise : Promise.resolve(clip('B')));
  const old = h.player.speak(h.voice, guidance()); await h.player.speak(h.voice, guidance('B')); slow.resolve(clip('A')); await old;
  assert.equal(h.audios.length, 1); assert.equal(h.audios[0].src, 'B'); assert.equal(h.audios[0].plays, 1);
  console.log('PASS stale A never plays after fast B');
}
{
  for (const h of [harness(undefined, true), harness(async () => fail), harness(async () => { throw new Error('Private provider error'); })]) {
    await assert.doesNotReject(h.player.speak(h.voice, guidance())); assert.equal(h.statuses.at(-1), 'unavailable');
    h.player.stop(); assert.equal(h.statuses.at(-1), null);
  }
  let fails = true; const h = harness(async () => fails ? fail : clip('success'));
  await h.player.speak(h.voice, guidance()); fails = false; await h.player.speak(h.voice, guidance('B'));
  assert.deepEqual(h.statuses, ['unavailable', null]);
  // A stale play rejection must not replace the next clip's successful status.
  const rejected = deferred<void>(); const statuses: VoiceStatus[] = []; let first = true;
  const voice: VoiceAdapter = { synthesize: async (r) => clip(r.instructionId) };
  const p = createVoicePlayer({
    createAudio: (src) => ({ src, pause() {}, play() { if (first) { first = false; return rejected.promise; } return Promise.resolve(); } }),
    onStatus: (s) => statuses.push(s) });
  const a = p.speak(voice, guidance()); await Promise.resolve(); await p.speak(voice, guidance('B'));
  rejected.reject(new Error('Obsolete playback error')); await a; assert.deepEqual(statuses, [null]);
  console.log('PASS playback and synthesis failures are contained; success clears status');
}
{
  const slow = deferred<Result<SpeechClip>>(); const h = harness(() => slow.promise);
  const task = h.player.speak(h.voice, guidance()); h.player.dispose(); slow.resolve(clip('late')); await task;
  await h.player.speak(h.voice, guidance('B')); assert.equal(h.audios.length, 0); assert.equal(h.requests.length, 1);
  const playing = harness(); await playing.player.speak(playing.voice, guidance()); playing.player.dispose();
  assert.equal(playing.audios[0].pauses, 1); assert.equal(playing.audios[0].src, '');
  console.log('PASS dispose cancels audio and blocks late or future playback');
}
{
  const source = readFileSync(new URL('./GuideScreen.tsx', import.meta.url), 'utf8');
  assert(source.includes("speech: 'Browser speech'")); assert(source.includes("speech: 'Voz del navegador'"));
  assert(source.includes('<p id="speech-source" className={styles.speechSource}>{voice ? t.generatedVoice : t.speech}</p>'));
  assert(source.includes('<p className="say">'));
  console.log('PASS source assertion: visible bilingual browser label and caption retained');
}

// Collect regression failures so the unchanged player reports every affected path.
const regressionFailures: string[] = [];
function expectEqual(actual: unknown, expected: unknown, message: string) {
  try { assert.deepEqual(actual, expected, message); }
  catch { regressionFailures.push(message); console.log(`FAIL ${message}`); }
}
for (const outcome of ['throw', 'ok:false', 'ok'] as const) {
  const x = deferred<Result<SpeechClip>>(); const y = deferred<Result<SpeechClip>>();
  const h = harness(() => x.promise); const requestsY: SpeechRequest[] = [];
  const voiceY: VoiceAdapter = { synthesize: (r) => { requestsY.push(r); return y.promise; } };
  const old = h.player.speak(h.voice, guidance());
  await h.player.speak(h.voice, guidance());
  expectEqual(h.requests.length, 1, `${outcome}: same pending adapter requests once`);
  const next = h.player.speak(voiceY, guidance());
  expectEqual(requestsY.length, 1, `${outcome}: replacement Y requested once`);
  if (outcome === 'throw') x.reject(new Error('Obsolete provider error'));
  else x.resolve(outcome === 'ok' ? clip('X') : fail);
  await old;
  expectEqual(h.audios.length, 0, `${outcome}: obsolete X creates no audio`);
  expectEqual(h.statuses, [], `${outcome}: obsolete X does not set unavailable`);
  await h.player.speak(voiceY, guidance());
  expectEqual(requestsY.length, 1, `${outcome}: obsolete X cannot clear pending Y dedupe`);
  y.resolve(clip('Y')); await next;
  expectEqual(h.audios.map((a) => [a.src, a.plays]), [['Y', 1]], `${outcome}: only Y clip plays`);
  expectEqual(h.statuses.at(-1), null, `${outcome}: Y success clears status`);
  console.log(`CHECK pending adapter replacement: X ${outcome}`);
}
{
  const slow = deferred<Result<SpeechClip>>();
  const h = harness(() => h.requests.length === 1 ? slow.promise : Promise.resolve(clip('S2')));
  const old = h.player.speak(h.voice, guidance('A', 'en', guidance().text, 1, 'S1'));
  await h.player.speak(h.voice, guidance('A', 'en', guidance().text, 1, 'S2'));
  expectEqual(h.requests.length, 2, 'session: S2 requested with identical instruction, locale and text');
  slow.resolve(clip('S1')); await old;
  expectEqual(h.audios.map((a) => [a.src, a.plays]), [['S2', 1]], 'session: late S1 creates no audio and only S2 plays');
  console.log('CHECK session key isolation');
}
for (const failure of ['ok:false', 'throw', 'play'] as const) {
  for (const replace of [false, true]) {
    let fails = true; const statuses: VoiceStatus[] = [];
    const requests: SpeechRequest[] = []; const audios: Array<AudioLike & { plays: number }> = [];
    const voice: VoiceAdapter = { synthesize: async (r) => {
      requests.push(r);
      if (fails && failure === 'throw') throw new Error('Private provider error');
      return fails && failure === 'ok:false' ? fail : clip('retry');
    } };
    const player = createVoicePlayer({ createAudio: (src) => {
      const audio = { src, plays: 0, pause() {}, async play() {
        this.plays++; if (fails && failure === 'play') throw new Error('Private audio error');
      } }; audios.push(audio); return audio;
    }, onStatus: (s) => statuses.push(s) });
    await player.speak(voice, guidance());
    expectEqual(statuses.at(-1), 'unavailable', `${failure}: failure sets unavailable`);
    fails = false;
    const retryVoice = replace ? { synthesize: voice.synthesize } : voice;
    const retryGuidance = { ...guidance(), sequence: replace ? 1 : 2 };
    const label = `${failure}, ${replace ? 'new adapter same sequence' : 'same adapter sequence+1'}`;
    await player.speak(retryVoice, retryGuidance);
    expectEqual(requests.length, 2, `${label}: same instruction retries`);
    expectEqual(audios.at(-1)?.src, 'retry', `${label}: retry clip retained`);
    expectEqual(audios.at(-1)?.plays, 1, `${label}: retry clip plays once`);
    expectEqual(statuses.at(-1), null, `${label}: retry clears status`);
    await player.speak(retryVoice, retryGuidance);
    await player.speak(retryVoice, { ...retryGuidance, sequence: retryGuidance.sequence + 1 });
    expectEqual(requests.length, 2, `${label}: successful retry stays deduplicated`);
  }
  console.log(`CHECK same-instruction retry: ${failure}`);
}
assert.equal(regressionFailures.length, 0, `Regression failures (${regressionFailures.length}):\n${regressionFailures.join('\n')}`);
console.log('PASS all 7 regression groups');
