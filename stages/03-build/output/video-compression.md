# Local video compression before upload

Status: implemented; helper and TypeScript checks pass. Recorded 2026-10-03 in `feat/video-compression`. Browser and real codec checks are pending.

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

## Limits and next action

No real phone/browser codec proof yet. No rendered 390/1280 review was run for this change. Progress and cancellation are wired to the inspected API but have no real conversion evidence yet. BufferTarget keeps the output in memory; long videos can exhaust browser memory. QUALITY_HIGH does not guarantee a smaller file or an output under 100 MiB. Packet statistics use average frame rate, so variable-rate input does not have a separate instantaneous-frame-rate guarantee.

Next action: browser review at 390 and 1280 pixels, then a real codec conversion check with audio and rotated portrait footage. Check cancellation and replacement during conversion, unsupported codecs and an output above 100 MiB. Run an independent review of the exact commit before integration. No independent review, push or deployment was done in this task. The merger must reconcile PROGRESS.md before merge.
