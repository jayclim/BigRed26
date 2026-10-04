import assert from 'node:assert/strict';
import { targetSize, requiredTrackLoss } from './compressVideo.ts';
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
const largeVideo = { type: 'video/mp4', size: MAX_MEDIA_BYTES + 1 };
assert.equal(mediaPickError(largeVideo), null);
assert.ok(mediaInputError(largeVideo));
assert.ok(mediaPickError({ ...largeVideo, type: 'image/png' }));
assert.ok(mediaPickError({ type: 'video/mp4', size: 0 }));
console.log('Video compression checks passed: dimensions, discarded tracks, picker/server limits.');
