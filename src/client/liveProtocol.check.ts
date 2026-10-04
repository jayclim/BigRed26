import assert from 'node:assert/strict';
import {
  audioEndMessage, audioMessage, base64ToBytes, bytesToBase64, createCaptions, decodeSocketData, durationMs, floatToPcm16, GENERATING_TIMEOUT_MS, liveUrl,
  needsAudioResume, parseServerMessage, tickAllowed, TICK_AFTER_SILENCE_MS, pcm16ToFloat32, setupMessage, textMessage, videoMessage,
} from './liveProtocol.ts';

// Server messages seen in the real session: setup, audio with transcription, turn end, resumption updates, go-away.
assert.deepEqual(parseServerMessage('{"setupComplete":{}}'), [{ kind: 'setupComplete' }]);
assert.deepEqual(parseServerMessage(JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: 'AAA=' } }] }, outputTranscription: { text: 'Hi' } } })),
  [{ kind: 'audio', data: 'AAA=' }, { kind: 'output', text: 'Hi' }]);
assert.deepEqual(parseServerMessage('{"serverContent":{"turnComplete":true}}'), [{ kind: 'turnComplete' }]);
assert.deepEqual(parseServerMessage('{"serverContent":{"interrupted":true}}'), [{ kind: 'interrupted' }]);
assert.deepEqual(parseServerMessage('{"serverContent":{"inputTranscription":{"text":"hello"}}}'), [{ kind: 'input', text: 'hello' }]);
assert.deepEqual(parseServerMessage('{"goAway":{"timeLeft":"50s"}}'), [{ kind: 'goAway', timeLeftMs: 50_000 }]);
for (const ignored of ['{"sessionResumptionUpdate":{"newHandle":"h"}}', '{}', '[]', 'null', 'not json', '{"serverContent":{"modelTurn":{"parts":[{"text":"x"},{"inlineData":{"mimeType":"image/png","data":"AA"}},null,5]}}}', '']) assert.deepEqual(parseServerMessage(ignored), [], ignored);
assert.equal(durationMs('1.5s'), 1500); assert.equal(durationMs({ seconds: 2, nanos: 500_000_000 }), 2500); assert.equal(durationMs('-3s'), 0); assert.equal(durationMs(undefined), 0); assert.equal(durationMs('abc'), 0);

// Client messages use the documented shapes and field names.
assert.deepEqual(JSON.parse(videoMessage('QQ==')), { realtimeInput: { video: { data: 'QQ==', mimeType: 'image/jpeg' } } });
assert.deepEqual(JSON.parse(audioMessage('QQ==')), { realtimeInput: { audio: { data: 'QQ==', mimeType: 'audio/pcm;rate=16000' } } });
assert.deepEqual(JSON.parse(textMessage('hi')), { realtimeInput: { text: 'hi' } });
assert.deepEqual(JSON.parse(audioEndMessage()), { realtimeInput: { audioStreamEnd: true } });
assert.deepEqual(JSON.parse(setupMessage({ model: 'models/m' })), { setup: { model: 'models/m' } });
assert.equal(liveUrl('wss://h/p', 'auth_tokens/a b'), 'wss://h/p?access_token=auth_tokens%2Fa%20b');

// Base64 and PCM round trips, including a chunk bigger than the encoder's slice size.
const big = Uint8Array.from({ length: 100_000 }, (_, i) => i % 251);
assert.deepEqual(base64ToBytes(bytesToBase64(big)), big);
const pcm = new Uint8Array(new Int16Array([0, 16384, -16384, 32767, -32768]).buffer);
const floats = pcm16ToFloat32(pcm);
assert.deepEqual([...floats], [0, 0.5, -0.5, 32767 / 32768, -1]);
assert.equal(pcm16ToFloat32(new Uint8Array([1, 0, 9])).length, 1); // odd trailing byte dropped
assert.equal(pcm16ToFloat32(new Uint8Array(pcm.buffer, 2, 4)).length, 2); // respects byteOffset
const tone = Float32Array.from({ length: 480 }, (_, i) => Math.sin((2 * Math.PI * i) / 48));
const down = floatToPcm16(tone, 48_000);
assert.equal(down.length, 160 * 2); // 48 kHz to 16 kHz is a third of the samples
assert.equal(floatToPcm16(new Float32Array([2, -2, 2, -2]), 16_000).length, 8);
assert.deepEqual([...pcm16ToFloat32(floatToPcm16(new Float32Array([5, -5]), 16_000))], [32767 / 32768, -1]); // clipped, not wrapped
assert.equal(floatToPcm16(new Float32Array(0), 48_000).length, 0);

// Captions: chunks join within a turn; a new turn starts a new line; only the last lines stay.
const c = createCaptions(2);
assert.deepEqual(c.push('Turn left'), ['Turn left']); assert.deepEqual(c.push(' at the board.'), ['Turn left at the board.']);
c.endTurn(); assert.deepEqual(c.push('Arrived.'), ['Turn left at the board.', 'Arrived.']);
c.endTurn(); assert.deepEqual(c.push('Wait.'), ['Arrived.', 'Wait.']);
assert.deepEqual(c.reset(), []); assert.deepEqual(c.lines, []);
// Socket frames decode synchronously and in order: string, ArrayBuffer and views give the same text; other data is dropped.
const enc = new TextEncoder();
const frames = ['{"setupComplete":{}}', '{"serverContent":{"turnComplete":true}}', '{"a":"é"}'];
assert.deepEqual([frames[0], enc.encode(frames[1]).buffer, enc.encode(frames[2])].map(decodeSocketData), frames);
assert.equal(decodeSocketData(new ArrayBuffer(0)), '');
for (const bad of [null, undefined, 5, {}, []]) assert.equal(decodeSocketData(bad), null);

// The tick timer: blocked while speaking or waiting for the model, but a stuck `generating` flag clears after the timeout.
const base = { ready: true, generating: false, generatingSince: 0, playing: false, lastSpoke: 0, now: TICK_AFTER_SILENCE_MS };
assert.equal(tickAllowed(base), true);
assert.equal(tickAllowed({ ...base, ready: false }), false);
assert.equal(tickAllowed({ ...base, playing: true }), false);
assert.equal(tickAllowed({ ...base, now: TICK_AFTER_SILENCE_MS - 1 }), false);
const stuck = { ...base, generating: true, generatingSince: 1000, lastSpoke: 1000 };
assert.equal(tickAllowed({ ...stuck, now: 1000 + GENERATING_TIMEOUT_MS - 1 }), false);
assert.equal(tickAllowed({ ...stuck, now: 1000 + GENERATING_TIMEOUT_MS + TICK_AFTER_SILENCE_MS }), true);

// iOS audio resume.
assert.deepEqual(['running', 'suspended', 'interrupted', 'closed'].map((st) => needsAudioResume(st, true)), [false, true, true, false]);
assert.equal(needsAudioResume('interrupted', false), false);
console.log('live protocol checks passed');
