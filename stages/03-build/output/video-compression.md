# Local video compression before upload

Status: implemented; helper, TypeScript, build and synthetic browser checks pass. Recorded 2026-10-04 in `feat/video-compression` at commit beac2e2. Real phone checks are pending.

## Behavior

Teach accepts non-empty MP4, MOV and WebM files in its picker, including files over 100 MiB. The upload limit remains 100 MiB. Server validation and `MAX_MEDIA_BYTES` are unchanged. Larger files show “Too large to upload. Compress on this device” and a Compress button. Files within the limit can upload directly or use Compress first.

Compression keeps the original File. The UI shows original and output sizes, a native progress element with a percentage, and Cancel. Use original is available when the original passes upload validation. Upload is disabled during compression and whenever the selected file fails `mediaInputError`. An output over the limit asks for a shorter clip. It does not trigger another downscale. Compression does not upload or create a draft. Draft creation remains an explicit action after upload.

Unmount, a new selection, Choose another file and Cancel abort conversion. A generation counter rejects obsolete progress, success and failure results. The existing selection-change callbacks remain in place.

## Decisions and inspected evidence

The lead had already installed Mediabunny 1.61.1. No install or network request was used. Its installed declaration file and source establish the API used here. Its installed package declares MPL-2.0. The library loads through `await import('mediabunny')` only when compression starts.

The conversion uses BlobSource and ALL_FORMATS, an MP4 output and BufferTarget. Display dimensions include pixel aspect ratio and rotation. The long edge is capped at 1920 and the short edge at 1080. Dimensions round down to even values, without upscaling. Contain fitting preserves the image aspect ratio within the rounded output bounds. Packet statistics determine whether to request 30 fps; lower source frame rates stay unchanged. Video and AAC audio use QUALITY_HIGH. AVC is selected when the browser can encode it; otherwise Mediabunny selects a supported MP4 video codec.

Invalid conversions and discarded primary video or any audio track fail with browser guidance. Discarding a secondary video track alone is allowed. Cancellation calls `conversion.cancel()` and returns AbortError. Input resources are disposed. No fallback encoder or automatic further downscale is added.

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
