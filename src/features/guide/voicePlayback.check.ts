import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Guidance, Result, SpeechClip, SpeechRequest, VoiceAdapter } from '../../../contracts/contracts.ts';
import { createVoicePlayer, DEFAULT_VOICE_ID, type AudioLike, type VoiceStatus } from './voicePlayback.ts';

const guidance = (instructionId = 'A', locale: 'en' | 'es' = 'en', text = '  Turn left.\nKeep B214.  ', sequence = 1): Guidance => ({
  instructionId, locale, text, sequence, sessionId: 'session', routeVersion: 1, mode: 'mock',
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
  const player = createVoicePlayer({
    voice: { synthesize: (r) => { requests.push(r); return synthesize(r); } },
    createAudio: (src) => {
      const audio = { src, plays: 0, pauses: 0,
        async play() { this.plays++; if (rejectPlay) throw new Error('Private audio error'); },
        pause() { this.pauses++; },
      };
      audios.push(audio); return audio;
    }, onStatus: (s) => statuses.push(s),
  });
  return { player, requests, audios, statuses };
}
{
  const h = harness(); const g = guidance();
  await h.player.speak(g); await h.player.speak(g); await h.player.speak({ ...g, sequence: 2 });
  assert.equal(h.requests.length, 1); assert.equal(h.audios[0].plays, 1);
  assert.deepEqual(h.requests[0], { text: g.text, locale: g.locale, instructionId: g.instructionId, voiceId: DEFAULT_VOICE_ID });
  // Like browser speech, only the current instruction is deduplicated: A, B, A speaks A again.
  await h.player.speak(guidance('B')); await h.player.speak(g);
  assert.equal(h.requests.length, 3);
  console.log('PASS duplicate instructions and exact request fields');
}
{
  const h = harness(); await h.player.speak(guidance()); h.player.stop();
  assert.equal(h.audios[0].pauses, 1); assert.equal(h.audios[0].src, '');
  await h.player.speak(guidance()); await h.player.speak(guidance()); assert.equal(h.requests.length, 2);
  const slow = deferred<Result<SpeechClip>>(); const pending = harness(() => slow.promise);
  const task = pending.player.speak(guidance()); pending.player.stop(); slow.resolve(clip('late')); await task;
  assert.equal(pending.audios.length, 0); assert.equal(pending.statuses.at(-1), null);
  await pending.player.speak(guidance()); assert.equal(pending.audios.length, 1);
  console.log('PASS mute, late synthesis cancellation and re-enable');
}
{
  const h = harness(); await h.player.speak(guidance()); await h.player.speak(guidance('A', 'es', 'Gira a la izquierda.'));
  assert.equal(h.requests[1].locale, 'es'); assert.equal(h.requests.length, 2);
  assert.equal(h.audios[0].pauses, 1); assert.equal(h.audios[0].src, ''); assert.equal(h.audios[1].plays, 1);
  console.log('PASS locale switch requests Spanish and cancels English audio');
}
{
  const slow = deferred<Result<SpeechClip>>(); const h = harness((r) => r.instructionId === 'A' ? slow.promise : Promise.resolve(clip('B')));
  const old = h.player.speak(guidance()); await h.player.speak(guidance('B')); slow.resolve(clip('A')); await old;
  assert.equal(h.audios.length, 1); assert.equal(h.audios[0].src, 'B'); assert.equal(h.audios[0].plays, 1);
  console.log('PASS stale A never plays after fast B');
}
{
  for (const h of [harness(undefined, true), harness(async () => fail), harness(async () => { throw new Error('Private provider error'); })]) {
    await assert.doesNotReject(h.player.speak(guidance())); assert.equal(h.statuses.at(-1), 'unavailable');
    h.player.stop(); assert.equal(h.statuses.at(-1), null);
  }
  let fails = true; const h = harness(async () => fails ? fail : clip('success'));
  await h.player.speak(guidance()); fails = false; await h.player.speak(guidance('B'));
  assert.deepEqual(h.statuses, ['unavailable', null]);
  // A stale play rejection must not replace the next clip's successful status.
  const rejected = deferred<void>(); const statuses: VoiceStatus[] = []; let first = true;
  const p = createVoicePlayer({ voice: { synthesize: async (r) => clip(r.instructionId) },
    createAudio: (src) => ({ src, pause() {}, play() { if (first) { first = false; return rejected.promise; } return Promise.resolve(); } }),
    onStatus: (s) => statuses.push(s) });
  const a = p.speak(guidance()); await Promise.resolve(); await p.speak(guidance('B'));
  rejected.reject(new Error('Obsolete playback error')); await a; assert.deepEqual(statuses, [null]);
  console.log('PASS playback and synthesis failures are contained; success clears status');
}
{
  const slow = deferred<Result<SpeechClip>>(); const h = harness(() => slow.promise);
  const task = h.player.speak(guidance()); h.player.dispose(); slow.resolve(clip('late')); await task;
  await h.player.speak(guidance('B')); assert.equal(h.audios.length, 0); assert.equal(h.requests.length, 1);
  const playing = harness(); await playing.player.speak(guidance()); playing.player.dispose();
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
