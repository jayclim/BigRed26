import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as mb from 'mediabunny';
import {
  targetSize, requiredTrackLoss, auxiliaryAudioTracks, audioTrackDiagnostics,
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
assert.deepEqual(auxiliaryAudioTracks([primaryInfo, unknownInfo], audio, true), [secondAudio]);
assert.deepEqual(auxiliaryAudioTracks([primaryInfo], audio, true), []);
assert.deepEqual(auxiliaryAudioTracks([], null, true), []);
assert.deepEqual(auxiliaryAudioTracks([primaryInfo, { ...unknownInfo, codec: 'aac', decodable: true }], audio, true), []);
for (const [tracks, primary, iso] of [
  [[unknownInfo], secondAudio, true],
  [[primaryInfo, unknownInfo], secondAudio, true],
  [[primaryInfo, { ...unknownInfo, isDefault: true }], audio, true],
  [[primaryInfo, unknownInfo], audio, false],
] as const) {
  assert.throws(() => auxiliaryAudioTracks(tracks, primary, iso), (error: unknown) => {
    assert.ok(error instanceof VideoCompressionError);
    const text = compressionErrorMessage(error);
    assert.ok(text.startsWith(AUDIO_FORMAT_UNKNOWN));
    assert.match(text, /audio track 3: codec=unknown, container=mp4a/);
    assert.match(text, /original file is unchanged/);
    assert.doesNotMatch(text, /desktop|Edge|This browser cannot compress/);
    return true;
  });
}
assert.throws(() => auxiliaryAudioTracks([{ ...primaryInfo, decodable: false }, unknownInfo], audio, true),
  new RegExp(AUDIO_DECODER_UNSUPPORTED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
const withAuxiliary = { primaryVideo: video, audioTracks: [audio, secondAudio], auxiliaryAudio: [secondAudio] };
assert.equal(requiredTrackLoss([{ track: secondAudio, reason: 'discarded_by_user' }], withAuxiliary), null);
assert.equal(requiredTrackLoss([{ track: secondAudio, reason: 'unknown_source_codec' }], withAuxiliary), AUDIO_FORMAT_UNKNOWN);
assert.ok(requiredTrackLoss([{ track: audio, reason: 'discarded_by_user' }], withAuxiliary));
assert.equal(requiredTrackLoss([{ track: audio, reason: 'undecodable_source_codec' }], withAuxiliary), AUDIO_DECODER_UNSUPPORTED);
assert.equal(compressionErrorMessage(new Error('unexpected')), COMPRESSION_FAILED);
assert.equal(compressionErrorMessage(new VideoCompressionError(COMPRESSION_UNSUPPORTED)), COMPRESSION_UNSUPPORTED);
assert.match(audioTrackDiagnostics([primaryInfo, unknownInfo]), /default=false, decodable=false/);

// Real MP4 parser and Conversion reproduction; no browser codec is needed for packet copying.
// The fixture has H.264, default AAC and a disabled extra mp4a track whose esds
// objectTypeIndication is patched from 0x40 to 0xff. It contains only synthetic sound.
const fixture = readFileSync(new URL('./fixtures/unknown-secondary-audio.mp4', import.meta.url));
const input = new mb.Input({ source: new mb.BufferSource(fixture), formats: mb.ALL_FORMATS });
try {
  const audios = await input.getAudioTracks();
  const primary = await input.getPrimaryAudioTrack();
  assert.equal(audios.length, 2);
  assert.equal(primary, audios[0]);
  assert.equal(await audios[0].getCodec(), 'aac');
  assert.equal(await audios[1].getCodec(), null);
  assert.equal((await audios[1].getDisposition()).default, false);
  const makeOutput = () => new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
  const reproduction = await mb.Conversion.init({ input, output: makeOutput(), video: { discard: true }, showWarnings: false });
  assert.ok(reproduction.discardedTracks.some(({ track, reason }) => track === audios[1] && reason === 'unknown_source_codec'));
  assert.ok(reproduction.utilizedTracks.includes(audios[0]));
  await reproduction.cancel();

  // Inject only capability evidence: Node has no AudioDecoder. A native browser
  // run is still needed to check this policy with its decoder and encoder.
  const info = await Promise.all(audios.map(async track => ({
    track, id: track.id, codec: await track.getCodec(), internalCodecId: await track.getInternalCodecId(),
    isDefault: (await track.getDisposition()).default, decodable: track === primary,
  })));
  const auxiliary = auxiliaryAudioTracks(info, primary, await input.getFormat() instanceof mb.IsobmffInputFormat);
  const output = makeOutput();
  const fixed = await mb.Conversion.init({ input, output, video: { discard: true },
    audio: track => auxiliary.includes(track) ? { discard: true } : {}, showWarnings: false });
  assert.equal(fixed.isValid, true);
  assert.equal(requiredTrackLoss(fixed.discardedTracks, { primaryVideo: null, audioTracks: audios, auxiliaryAudio: auxiliary }), null);
  assert.deepEqual(fixed.utilizedTracks, [primary]);
  assert.ok(fixed.discardedTracks.some(({ track, reason }) => track === audios[1] && reason === 'discarded_by_user'));
  await fixed.execute();
  const result = new mb.Input({ source: new mb.BufferSource((output.target as mb.BufferTarget).buffer!), formats: mb.ALL_FORMATS });
  try {
    const retained = await result.getAudioTracks();
    assert.equal(retained.length, 1);
    assert.equal(await retained[0].getCodec(), 'aac');
    assert.ok((await retained[0].computePacketStats()).packetCount > 0);
  } finally { result.dispose(); }
} finally { input.dispose(); }

const canceled = new AbortController(); canceled.abort();
await assert.rejects(compressVideo(new File([fixture], 'fixture.mp4'), { signal: canceled.signal }), { name: 'AbortError' });
// Pass only the initial encoder-presence gate. Unknown audio must fail before
// any encoder is constructed. This checks the actual compressor error boundary.
const encoderDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'VideoEncoder');
Object.defineProperty(globalThis, 'VideoEncoder', { configurable: true, value: class {
  constructor() { throw new Error('Unknown audio must fail before encoding.'); }
} });
try {
  const unknownOnly = readFileSync(new URL('./fixtures/unknown-only-audio.mp4', import.meta.url));
  const original = new File([unknownOnly], 'unknown-only.mp4', { type: 'video/mp4' });
  await assert.rejects(compressVideo(original), (error: unknown) => {
    assert.ok(error instanceof VideoCompressionError);
    assert.ok(compressionErrorMessage(error).startsWith(AUDIO_FORMAT_UNKNOWN));
    assert.doesNotMatch(error.message, /desktop|Edge|This browser cannot compress/);
    assert.match(error.message, /audio track 2: codec=unknown, container=mp4a/);
    return true;
  });
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), unknownOnly);
} finally {
  if (encoderDescriptor) Object.defineProperty(globalThis, 'VideoEncoder', encoderDescriptor);
  else Reflect.deleteProperty(globalThis, 'VideoEncoder');
}
const largeVideo = { type: 'video/mp4', size: MAX_MEDIA_BYTES + 1 };
assert.equal(mediaPickError(largeVideo), null);
assert.ok(mediaInputError(largeVideo));
assert.ok(mediaPickError({ ...largeVideo, type: 'image/png' }));
assert.ok(mediaPickError({ type: 'video/mp4', size: 0 }));
console.log('Video compression checks passed: dimensions, audio policy/errors, real MP4 unknown_source_codec reproduction, retained AAC packets, cancellation, picker/server limits.');
