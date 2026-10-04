# Local video compression before upload

Status: implemented. The original synthetic browser checks passed at beac2e2. The current PR18 repair rejects unknown or undecodable audio in every track. Its checks are recorded below. Browser and real phone checks of this repair are pending.

## Behavior

Teach accepts non-empty MP4, MOV and WebM files in its picker, including files over 100 MiB. The upload limit remains 100 MiB. Server validation and `MAX_MEDIA_BYTES` are unchanged. Larger files show “Too large to upload. Compress on this device” and a Compress button. Files within the limit can upload directly or use Compress first.

Compression keeps the original File. The UI shows original and output sizes, a native progress element with a percentage, and Cancel. Use original is available when the original passes upload validation. Upload is disabled during compression and whenever the selected file fails `mediaInputError`. An output over the limit asks for a shorter clip. It does not trigger another downscale. Compression does not upload or create a draft. Draft creation remains an explicit action after upload.

Unmount, a new selection, Choose another file and Cancel abort conversion. A generation counter rejects obsolete progress, success and failure results. The existing selection-change callbacks remain in place.

## Decisions and inspected evidence

The lead had already installed Mediabunny 1.61.1. No install or network request was used. Its installed declaration file and source establish the API used here. Its installed package declares MPL-2.0. The library loads through `await import('mediabunny')` only when compression starts.

The conversion uses BlobSource and ALL_FORMATS, an MP4 output and BufferTarget. Display dimensions include pixel aspect ratio and rotation. The long edge is capped at 1920 and the short edge at 1080. Dimensions round down to even values, without upscaling. Contain fitting preserves the image aspect ratio within the rounded output bounds. Packet statistics determine whether to request 30 fps; lower source frame rates stay unchanged. Video and AAC audio use QUALITY_HIGH. AVC is selected when the browser can encode it; otherwise Mediabunny selects a supported MP4 video codec.

Invalid conversions and discarded primary video fail. Any discarded audio track is a loss. Unknown or undecodable audio in any track fails before conversion starts, with audio-specific guidance and track details. No audio is discarded. Discarding a secondary video track alone is allowed. Cancellation calls `conversion.cancel()` and returns AbortError. Input resources are disposed. No fallback encoder or automatic further downscale is added.

## Actual checks

- `npm run typecheck`: passed, exit 0.
- `npm run check`: passed, exit 0. Includes the existing core, media and extraction checks and new Node assertions for landscape 4K, portrait 4K, small and odd dimensions, even output dimensions, required track loss and the picker/upload size boundary.
- `npm run build`: failed, exit 1. Turbopack could not bind a sandbox port while processing `src/ui/theme.css` (EPERM).
- `npx next build --webpack`: passed, exit 0. Production compilation, TypeScript, static generation and build traces completed.
- `git diff --check`: passed.

## Browser checks (2026-10-04, commit beac2e2)

An independent read-only review of commit beac2e2 found no defects. Host `npx next build --webpack` passed. A headless Chrome session on an isolated local server ran these checks with synthetic H.264/AAC input:

- 1280 px, landscape 3840x2160, 21,977,955 bytes: output 1,763,870 bytes, 1920x1080, H.264 + AAC, 30 fps. Upload to `/api/media` passed.
- 390 px, portrait 2160x3840, 21,458,685 bytes: output 1,707,066 bytes, 1080x1920, H.264 + AAC, 30 fps. Upload passed.
- ffprobe found an audio track in both outputs. Output duration is 2.069 s from 2 s input (AAC padding). Nobody listened to the audio.
- No horizontal overflow at 390 or 1280 px. The 390 px full-page screenshot was inspected.
- Cancel prevented a late compressed result.
- With VideoEncoder disabled, the app showed a clear unsupported-browser error, and the original file stayed uploadable.

## Limits and next action

The portrait input has rotated pixel dimensions, not rotation metadata. No real phone, HEVC, HDR, rotation-metadata, long-video or memory checks were run. BufferTarget keeps the output in memory; long videos can exhaust browser memory. QUALITY_HIGH does not guarantee a smaller file or an output under 100 MiB. Packet statistics use average frame rate, so variable-rate input does not have a separate instantaneous-frame-rate guarantee. No output above 100 MiB was tested in the browser.

Next action: convert real phone footage (HEVC, HDR, rotation metadata, long clip) on a phone browser and listen to the audio.

## Previous repair worker snapshot (recorded 2026-10-04; superseded by published commit 6086578)

This section records the previous worker's behavior and checks. Published commit `6086578` supersedes its pre-publication status. The current PR18 repair below replaces its audio-discard policy.

Input provenance: user-supplied Android Chrome screenshot, dated 2026-10-03. It shows `file26479.mp4`, 316,846,695 bytes (about 302 MiB), a portrait indoor video preview, and `An audio track cannot be preserved. Unsupported tracks: unknown_source_codec`. No raw video file was supplied. The screenshot establishes the reported failure. It does not establish the audio codec, track count, track purpose, or decoder support on that phone.

Observed source evidence: installed Mediabunny 1.61.1, `src/conversion.ts`, `_processAudioTrack` at line 1930. It records `unknown_source_codec` exactly when `await track.getCodec()` is null, then returns before decoder or encoder selection. `_processVideoTrack` has the same test at line 1446. A known codec that cannot be decoded has the separate reason `undecodable_source_codec`. Therefore, the reported reason does not prove a browser decoder failure or that a desktop browser would succeed.

The installed MP4 parser (`src/isobmff/isobmff-demuxer.ts`) identifies audio from the `hdlr` value `soun`, starting with a null codec (lines 1047–1060). Other handler types do not become audio solely because they contain metadata. Audio sample entries select recognized codecs; `mp4a` defers codec selection to `esds` (line 1192). The `esds` object type selects AAC (0x40/0x67), MP3 (0x69/0x6b), Vorbis (0xdd), or DTS (0xa9), and an unsupported value leaves the codec unknown (lines 1629–1647). Unknown sample entries, unsupported PCM descriptions, and missing encrypted-codec metadata are other possible paths to a null codec. These are source paths, not a diagnosis of the phone file.

The library selects primary audio by pairability with primary video, default disposition and bitrate (`src/input.ts`, `getPrimaryAudioTrack`, lines 457–476). This choice does not guarantee decodability. In MP4/QuickTime, the parser maps the track-header enabled flag to `disposition.default` (lines 911–915). Conversion defaults to all tracks. Its per-track audio callback accepts `{ discard: true }` and reports `discarded_by_user` before codec processing (lines 984–1043).

Repair decision: keep all known audio. Explicitly discard an unknown secondary audio track only in MP4/QuickTime, when its enabled flag is false and the selected primary audio has a known codec and passes `canDecode()`. Disabled metadata is the bounded auxiliary-track signal used here. It does not prove what the track contains. Unknown primary audio, unknown active secondary audio, and unknown audio in other containers fail. A known primary that cannot be decoded also blocks this exception. Do not switch blindly to primary-only conversion.

Audio failures now explain the audio problem and ask the user to trim or re-export with standard audio settings, such as AAC. They state that the original file is unchanged. The upload UI preserves these messages instead of replacing them with desktop-browser guidance. Error diagnostics include each audio track's ID, recognized codec, container codec ID, default flag and decodability. An allowed auxiliary-track removal logs the same details locally. No raw media or file name is logged. Original-file handling, cancellation, stale-selection rejection, portrait dimensions, no-upscale behavior and the 100 MiB upload limit are unchanged.

### Controlled reproduction

Two small committed fixtures contain generated black frames and sine tones only. They were made with local FFmpeg 7.1.1. No phone footage is included.

- `src/features/creator/fixtures/unknown-secondary-audio.mp4`: 8,013 bytes. H.264 video, default AAC primary audio, and disabled secondary audio. The extra track's `esds` DecoderConfigDescriptor objectTypeIndication was changed from 0x40 to unsupported 0xff at byte offset 1847. Its sample entry remains `mp4a`.
- `src/features/creator/fixtures/unknown-only-audio.mp4`: 4,890 bytes. H.264 video and one audio track. That audio track's objectTypeIndication was changed from 0x40 to 0xff at byte offset 4518.

Generation command for the unpatched two-audio source:

```sh
ffmpeg -f lavfi -i color=c=black:s=64x64:r=10:d=0.5 \
  -f lavfi -i sine=frequency=440:sample_rate=16000:duration=0.5 \
  -f lavfi -i sine=frequency=880:sample_rate=16000:duration=0.5 \
  -map 0:v -map 1:a -map 2:a -c:v libx264 -pix_fmt yuv420p \
  -c:a aac -b:a 32k -disposition:a:0 default -disposition:a:1 0 \
  -movflags +faststart source.mp4
```

The one-audio source was remuxed from that unpatched source with `ffmpeg -i source.mp4 -map 0:v -map 0:a:0 -c copy only.mp4`. The patches change only the object-type byte inside the appropriate `esds` descriptor. Tests need no FFmpeg install.

The real parser reports primary codec `aac` and extra codec null. Real `Conversion.init` without the repair reports `unknown_source_codec` for the extra track and still utilizes the primary track. With the policy callback, it reports `discarded_by_user` only for the extra track. Executing the test conversion produces one AAC track with packets. This test copies AAC packets and injects primary-decoder capability because Node has no native AudioDecoder. It proves track selection and retention, not browser transcoding. The unknown-only fixture runs through the actual compressor error boundary with an encoder-presence stub; it fails before encoding and leaves the original bytes unchanged.

### Actual repair checks

- `node src/features/creator/compressVideo.check.ts` on Node 24.11.1: exit 0. Output: `Video compression checks passed: dimensions, audio policy/errors, real MP4 unknown_source_codec reproduction, retained AAC packets, cancellation, picker/server limits.` The parser's `Unsupported audio codec (objectTypeIndication 255)` warning is expected for these fixtures.
- `npm run check`: exit 0. Core, media, 32 extraction cases and compressor checks passed. Extraction tests made no network calls.
- `npx tsc --noEmit`: exit 0 after accounting for binary container codec IDs in the installed API.
- `npm run build`: exit 1. Turbopack failed while processing the guide CSS module because its internal process could not bind a port: `Operation not permitted (os error 1)`.
- `npx next build --webpack`: exit 0. Production compilation, TypeScript, static generation and build traces passed.
- `git diff --check`: exit 0.
- Browser rerun prerequisite: a new isolated server on free port 3137 failed with `listen EPERM`. No browser run of the repair was possible in this sandbox. No existing server or tunnel was restarted; port 3012 was not used.

Viewport inspection found an existing `viewport` export with `width: 'device-width'` and `initialScale: 1` in `src/app/layout.tsx`. The screenshot's apparent desktop width does not prove a viewport bug. No layout change was made.

Remaining gates: obtain the raw phone recording privately to inspect actual track codecs, track count and enabled flags. Confirm whether a decodable primary exists beside an unknown disabled track. Run compression on the target Android Chrome phone and listen to retained audio. A 302 MiB file still needs successful local compression below 100 MiB; the small fixtures do not prove memory use, duration support or that size result. Run the browser harness with the auxiliary fixture on a host that permits an isolated server. PR review and integration remain with the integration owner.

Historical pre-publication receipt (superseded by `6086578`): explicit-path `git add` failed, exit 128, because the sandbox could not create `.git/worktrees/video-compression/index.lock` (`Operation not permitted`). At that time, the repair was uncommitted and unstaged. No push was attempted. Local HEAD and the cached origin branch ref were both `ba54d5ab8c1bd1b6d5d6f176a32afda4957b1713`. Live `git ls-remote origin refs/heads/feat/video-compression` failed, exit 128, with `Could not resolve host: github.com`. These results describe the old worker snapshot, not the current publication state.

## PR18 review blocker repair (2026-10-03 EDT)

Worker base: `feat/video-compression`, `6086578`. Unknown audio in any track now rejects with `AUDIO_FORMAT_UNKNOWN`. Undecodable audio in any known track rejects with `AUDIO_DECODER_UNSUPPORTED`. Both errors include track details and state that the original file is unchanged. Rejection occurs before any encoder is constructed. No audio is discarded. Any discarded audio track is a loss. The disabled-secondary exception and its log are removed. The 100 MiB upload bound and VideoUpload cancellation and stale-selection protection are unchanged.

The secondary and unknown-only fixtures now test production `compressVideo`. They assert the error, track details, zero encoder constructions and unchanged original bytes. The real parser still checks the AAC primary and null-codec disabled secondary. Node tests inject AAC decoder capability; they do not decode audio. An in-memory copy restores the secondary AAC object type and injects decoder failure for that track. No fixture file was changed or added.

Actual checks on Node 24.11.1:

- `node src/features/creator/compressVideo.check.ts`: exit 0. Output: `Video compression checks passed: dimensions, audio loss/errors, real MP4 parsing, unknown-only/secondary and undecodable-secondary rejection before encoding, original bytes, cancellation, picker/server limits.`
- `npm run check`: exit 0. Core, media and the same compressor checks passed. Output includes `media checks passed (bounded streams, exact file field, synthetic headers, storage, metadata, write failure)` and `extraction checks passed (32 cases; no network calls)`.
- `npx tsc --noEmit`: exit 0; no output.
- `npx next build --webpack`: exit 0. Output: `✓ Compiled successfully in 1387ms`, `  Finished TypeScript in 978ms ...` and `✓ Generating static pages using 13 workers (6/6) in 71ms`.
- `npm run build`: exit 1. Turbopack failed on the guide CSS module. Output: `Error [TurbopackInternalError]: Failed to write app endpoint /page`, `- binding to a port` and `- Operation not permitted (os error 1)`.
- `git diff --check`: exit 0; no output.

The parser warning `Unsupported audio codec (objectTypeIndication 255) - discarding track.` is expected for these synthetic fixtures. The compressor rejects the file; it does not return a file with that track removed.

Limits: this worker ran no browser or phone check and made no network or provider call. The original 302 MiB phone file is not available. This repair does not claim to fix that file. Fixtures are synthetic. Browser codec behavior, real audio playback, large-file memory use and compression below 100 MiB remain unverified.

Next action: the host commits and pushes the owned changes. Run the browser check, then a fresh independent review of the new published commit. This worker did not commit or push.
