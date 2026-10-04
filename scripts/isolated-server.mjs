// Starts the already-built app (`npm run build` first) on its own BREADCRUMB_DATA_FILE inside a fresh
// mkdtemp directory, so test scripts never read, reset or overwrite your real .data/ store. It also sets
// BREADCRUMB_TEST_FIXTURES=1: the fictional test routes are seeded and the synthetic test recognizer is registered.
// Production never sets this flag.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function startIsolatedServer(port) {
  const dir = mkdtempSync(join(tmpdir(), 'breadcrumb-data-'));
  const dataFile = join(dir, 'store.json');
  const proc = spawn('node_modules/.bin/next', ['start', '-p', String(port)], {
    env: { ...process.env, BREADCRUMB_DATA_FILE: dataFile, BREADCRUMB_TEST_FIXTURES: '1' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  let ready = false;
  let output = '';
  proc.stdout.on('data', (chunk) => {
    output = (output + chunk).slice(-2000);
    ready ||= output.includes('Ready in');
  });
  const stop = () => { proc.kill(); rmSync(dir, { recursive: true, force: true }); }; // only this run's own temp dir
  process.on('exit', stop); // also runs when an assertion throws; callers end with process.exit()
  const base = `http://localhost:${port}`;
  for (let i = 0; ; i++) {
    if (proc.exitCode !== null) throw new Error(`next start exited (${proc.exitCode}). Is port ${port} free and the app built?`);
    // Wait for OUR child to bind before probing; an occupied port could be the user's real app.
    if (ready && await fetch(`${base}/api/routes/demo-route`).then((r) => r.ok, () => false)) break;
    if (i > 100) throw new Error('Server did not become ready.');
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`isolated server ${base}, data ${dataFile}`);
  return { base, dataFile };
}
