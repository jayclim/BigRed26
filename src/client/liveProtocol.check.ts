import assert from 'node:assert/strict';
import {
  audioEndMessage, audioMessage, base64ToBytes, bytesToBase64, createCaptions, durationMs, floatToPcm16, liveUrl,
  parseServerMessage, pcm16ToFloat32, setupMessage, textMessage, videoMessage,
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
console.log('live protocol checks passed');
