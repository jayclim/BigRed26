import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mb from 'mediabunny';
import {
  targetSize, requiredTrackLoss, audioTrackDiagnostics,
  compressionErrorMessage, VideoCompressionError, AUDIO_FORMAT_UNKNOWN,
  AUDIO_DECODER_UNSUPPORTED, COMPRESSION_FAILED, COMPRESSION_UNSUPPORTED, compressVideo,
} from './compressVideo.ts';
import { MAX_MEDIA_BYTES, mediaInputError, mediaPickError } from '../../shared/mediaLimits.ts';

assert.deepEqual(targetSize(3840, 2160), { width: 1920, height: 1080 });
assert.deepEqual(targetSize(2160, 3840), { width: 1080, height: 1920 });
assert.deepEqual(targetSize(640, 360), { width: 640, height: 360 });
assert.deepEqual(targetSize(360, 640), { width: 360, height: 640 });
assert.deepEqual(targetSize(2000, 2000), { width: 1080, height: 1080 });
assert.deepEqual(targetSize(4000, 1000), { width: 1920, height: 480 });
for (const [width, height] of [[4033, 3025], [3025, 4033], [641, 359], [100, 2000]]) {
  const result = targetSize(width, height);
  assert.equal(result.width % 2, 0);
  assert.equal(result.height % 2, 0);
  assert.ok(Math.abs(result.width / result.height - width / height) < 0.02);
  assert.ok(result.width <= width && result.height <= height);
  assert.ok(Math.max(result.width, result.height) <= 1920);
  assert.ok(Math.min(result.width, result.height) <= 1080);
}
assert.throws(() => targetSize(0, 1080));
assert.throws(() => targetSize(NaN, 1080));
const video = {}, audio = {}, secondAudio = {}, otherVideo = {};
const discarded = (track: object) => [{ track, reason: 'no_encodable_target_codec' }];
assert.equal(requiredTrackLoss([], { primaryVideo: video, audioTracks: [audio] }), null);
assert.equal(requiredTrackLoss(discarded(otherVideo), { primaryVideo: video, audioTracks: [audio] }), null);
assert.match(requiredTrackLoss(discarded(video), { primaryVideo: video, audioTracks: [audio] })!, /primary video/);
assert.match(requiredTrackLoss(discarded(audio), { primaryVideo: video, audioTracks: [audio] })!, /audio/);
assert.match(requiredTrackLoss(discarded(secondAudio), { primaryVideo: video, audioTracks: [audio, secondAudio] })!, /audio/);
const primaryInfo = { track: audio, id: 2, codec: 'aac', internalCodecId: 'mp4a', isDefault: true, decodable: true };
const unknownInfo = { track: secondAudio, id: 3, codec: null, internalCodecId: 'mp4a', isDefault: false, decodable: false };
const inputTracks = { primaryVideo: video, audioTracks: [audio, secondAudio] };
assert.ok(requiredTrackLoss([{ track: secondAudio, reason: 'discarded_by_user' }], inputTracks));
assert.equal(requiredTrackLoss([{ track: secondAudio, reason: 'unknown_source_codec' }], inputTracks), AUDIO_FORMAT_UNKNOWN);
assert.ok(requiredTrackLoss([{ track: audio, reason: 'discarded_by_user' }], inputTracks));
assert.equal(requiredTrackLoss([{ track: secondAudio, reason: 'undecodable_source_codec' }], inputTracks), AUDIO_DECODER_UNSUPPORTED);
assert.equal(compressionErrorMessage(new Error('unexpected')), COMPRESSION_FAILED);
assert.equal(compressionErrorMessage(new VideoCompressionError(COMPRESSION_UNSUPPORTED)), COMPRESSION_UNSUPPORTED);
assert.match(audioTrackDiagnostics([primaryInfo, unknownInfo]), /default=false, decodable=false/);

// The fixture has H.264, default AAC and a disabled extra mp4a track whose esds
// objectTypeIndication is patched from 0x40 to 0xff. It contains only synthetic sound.
const fixture = readFileSync(new URL('./fixtures/unknown-secondary-audio.mp4', import.meta.url));
const canceled = new AbortController(); canceled.abort();
await assert.rejects(compressVideo(new File([fixture], 'fixture.mp4'), { signal: canceled.signal }), { name: 'AbortError' });
// Pass only the initial encoder-presence gate. Unknown audio must fail before
// any encoder is constructed. This checks the actual compressor error boundary.
const encoderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'VideoEncoder');
const audioEncoderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioEncoder');
const audioDecoderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioDecoder');
let encoderConstructions = 0;
const Encoder = class {
  constructor() { encoderConstructions++; throw new Error('Audio rejection must precede encoding.'); }
};
Object.defineProperty(globalThis, 'VideoEncoder', { configurable: true, value: Encoder });
Object.defineProperty(globalThis, 'AudioEncoder', { configurable: true, value: Encoder });
// Node has no native AudioDecoder. Inject AAC capability only; keep real parsing.
Object.defineProperty(globalThis, 'AudioDecoder', { configurable: true, value: class {
  static async isConfigSupported(config: AudioDecoderConfig) {
    return { supported: config.codec.startsWith('mp4a.40.'), config };
  }
} });
try {
  const input = new mb.Input({ source: new mb.BufferSource(fixture), formats: mb.ALL_FORMATS });
  try {
    const audios = await input.getAudioTracks();
    assert.equal(audios.length, 2);
    assert.equal(await input.getPrimaryAudioTrack(), audios[0]);
    assert.equal(await audios[0].getCodec(), 'aac');
    assert.equal(await audios[0].canDecode(), true);
    assert.equal(await audios[1].getCodec(), null);
    assert.equal((await audios[1].getDisposition()).default, false);
  } finally { input.dispose(); }

  const unknownOnly = readFileSync(new URL('./fixtures/unknown-only-audio.mp4', import.meta.url));
  for (const [bytes, name, trackId] of [
    [fixture, 'unknown-secondary.mp4', 3], [unknownOnly, 'unknown-only.mp4', 2],
  ] as const) {
    const original = new File([bytes], name, { type: 'video/mp4' });
    await assert.rejects(compressVideo(original), (error: unknown) => {
      assert.ok(error instanceof VideoCompressionError);
      assert.ok(compressionErrorMessage(error).startsWith(AUDIO_FORMAT_UNKNOWN));
      assert.doesNotMatch(error.message, /desktop|Edge|This browser cannot compress/);
      assert.ok(error.message.includes(`audio track ${trackId}: codec=unknown, container=mp4a`));
      assert.match(error.message, /original file is unchanged/);
      if (trackId === 3) assert.match(error.message, /audio track 2: codec=aac, container=mp4a, default=true, decodable=true/);
      return true;
    });
    assert.equal(encoderConstructions, 0);
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
  }

  // Restore the secondary track's AAC object type in memory, then inject an
  // unsupported secondary decoder. Do not change or add fixture files.
  const knownSecondary = Buffer.from(fixture);
  assert.equal(knownSecondary[1847], 0xff);
  knownSecondary[1847] = 0x40;
  const canDecode = mb.InputAudioTrack.prototype.canDecode;
  mb.InputAudioTrack.prototype.canDecode = async function () {
    return this.id === 3 ? false : canDecode.call(this);
  };
  try {
    const original = new File([knownSecondary], 'undecodable-secondary.mp4', { type: 'video/mp4' });
    await assert.rejects(compressVideo(original), (error: unknown) => {
      assert.ok(error instanceof VideoCompressionError);
      assert.ok(compressionErrorMessage(error).startsWith(AUDIO_DECODER_UNSUPPORTED));
      assert.match(error.message, /audio track 2: codec=aac, container=mp4a, default=true, decodable=true/);
      assert.match(error.message, /audio track 3: codec=aac, container=mp4a, default=false, decodable=false/);
      assert.match(error.message, /original file is unchanged/);
      return true;
    });
    assert.equal(encoderConstructions, 0);
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), knownSecondary);
  } finally { mb.InputAudioTrack.prototype.canDecode = canDecode; }
} finally {
  if (encoderDescriptor) Object.defineProperty(globalThis, 'VideoEncoder', encoderDescriptor);
  else Reflect.deleteProperty(globalThis, 'VideoEncoder');
  if (audioEncoderDescriptor) Object.defineProperty(globalThis, 'AudioEncoder', audioEncoderDescriptor);
  else Reflect.deleteProperty(globalThis, 'AudioEncoder');
  if (audioDecoderDescriptor) Object.defineProperty(globalThis, 'AudioDecoder', audioDecoderDescriptor);
  else Reflect.deleteProperty(globalThis, 'AudioDecoder');
}
const largeVideo = { type: 'video/mp4', size: MAX_MEDIA_BYTES + 1 };
assert.equal(mediaPickError(largeVideo), null);
assert.ok(mediaInputError(largeVideo));
assert.ok(mediaPickError({ ...largeVideo, type: 'image/png' }));
assert.ok(mediaPickError({ type: 'video/mp4', size: 0 }));
console.log('Video compression checks passed: dimensions, audio loss/errors, real MP4 parsing, unknown-only/secondary and undecodable-secondary rejection before encoding, original bytes, cancellation, picker/server limits.');
