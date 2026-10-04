# Smoke test flake: receipt

Status: fixed in the test; server behavior noted, not changed. 2026-10-03.

## Cause

`scripts/smoke-api.mjs` sent the over-limit chunked upload with `fetch`. The server answers 400 before it reads the whole body. `fetch` (undici) keeps that half-used socket in its shared pool. A later request reuses the socket, receives no answer for about 6 s, then fails with `read ECONNRESET`.

## Evidence (observed)

- Undici `sendHeaders` diagnostics, with the upload slowed by 1 ms per chunk to copy a slower CI machine:
  - The over-limit POST used socket port 51595.
  - The next `GET /api/routes/demo-route` that used port 51595 stalled about 6 s and failed with ECONNRESET.
  - The same pattern appeared in a second failure (port 51491, 6 s stall).
- Raw response to an over-limit request: `HTTP/1.1 400`, `Connection: keep-alive`, `Keep-Alive: timeout=5`. The server offers the socket for reuse but does not answer on it again.
- Standalone repro (over-limit upload, then 3 GET calls, 30 rounds): 0 failures at full speed, 1 and 2 failures with the slowed upload.
- Old smoke script: 41 of 42 runs passed at full speed (one failure under CPU load). With the slowed upload, 11 of 15 passed; all 4 failures were ECONNRESET.

## Fix

The over-limit request now uses `node:http` with `agent: false`. It stays chunked, has no Content-Length, stops sending when the response arrives, and destroys its own socket. It never enters the `fetch` pool. A write error or reset after the response head arrived is accepted. A close without any response fails the test. The `// ponytail:` comment marks the shortcut.

All assertions are kept: 400, `INVALID_INPUT`, `retryable` false, "upload body is too large", and no new media files.

The first version failed 3 of 15 slowed runs with an unhandled `EPIPE` from `req.end()`, and it sent `Connection: close`. The final version handles write errors and does not send `Connection: close`. I did not isolate which of the two changes removed the failures.

## Checks (observed)

- New smoke, full speed: 15 of 15 passes in a row.
- New smoke, upload slowed by 1 ms per chunk: 20 of 20 passes.
- `npm run check`: passed.
- `npx tsc --noEmit`: passed.
- Build: `npx next build --webpack`.

## Limits

- The flake did not reproduce at full speed on this machine. The cause is shown by the slowed repro, not by a failing CI log.
- The server still keeps a connection open after an early 400 on an unread body. A keep-alive client that reuses that socket can stall. Real users check size before upload, so no server change was made. Next action: if this appears in the demo path (for example through ngrok), test a server-side fix on the media route 400 (drain the body, or close the connection).
