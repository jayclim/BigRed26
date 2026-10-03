// Prove that a busy test port cannot redirect a smoke test into an unrelated server.
// Run from the project root: node scripts/isolated-server.check.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

let requests = 0;
const existing = createServer((_req, res) => { requests++; res.end('{}'); });
await new Promise((resolve) => existing.listen(0, resolve));
const port = existing.address().port;
const child = spawn(process.execPath, ['--input-type=module', '-e',
  `import { startIsolatedServer } from './scripts/isolated-server.mjs';
   try { await startIsolatedServer(${port}); process.exit(2); }
   catch { process.exit(0); }`], { stdio: 'ignore' });
const timer = setTimeout(() => child.kill(), 10000);
try {
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.equal(code, 0, 'isolated server must reject an occupied port');
  assert.equal(requests, 0, 'must not send any request to the unrelated server');
  console.log('isolated-server check passed: busy port rejected without touching existing server');
} finally {
  clearTimeout(timer);
  await new Promise((resolve) => existing.close(resolve));
}
