// TEST CLIP: generated tone, not ElevenLabs audio. Used only in isolated tests.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { cacheKey, DEFAULT_VOICE, storeAudio } from '../src/server/voice/voice.ts';
import { startIsolatedServer } from './isolated-server.mjs';

// The shared helper spawns the POSIX .bin/next launcher. Keep this Windows adaptation local.
async function startWindowsServer(port) {
  const directory = mkdtempSync(join(tmpdir(), 'breadcrumb-data-'));
  const dataFile = join(directory, 'store.json');
  const proc = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, BREADCRUMB_DATA_FILE: dataFile }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false; let output = ''; let failure;
  const collect = (chunk) => { output = (output + chunk).slice(-2000); ready ||= output.includes('Ready in'); };
  proc.stdout.on('data', collect); proc.stderr.on('data', collect); proc.on('error', (error) => { failure = error; });
  process.on('exit', () => { proc.kill(); rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i <= 100; i++) {
    if (failure || proc.exitCode !== null) throw new Error(`Isolated Next server failed: ${failure?.message ?? output}`);
    if (ready && await fetch(`${base}/api/routes/demo-route`).then((r) => r.ok, () => false)) {
      console.log(`isolated server ${base}, data ${dataFile}`); return { base, dataFile };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Isolated Next server did not become ready: ${output}`);
}

export const request = { text: 'TEST CLIP - generated tone, not ElevenLabs', locale: 'en', voiceId: 'default', instructionId: 'test-tone' };
export function testTone() {
  const samples = 8000; const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(6000 * Math.sin(2 * Math.PI * 440 * i / 16000)), 44 + i * 2);
  return { bytes, contentType: 'audio/wav' };
}
export async function fixtureServer(port) {
  const directory = mkdtempSync(join(tmpdir(), 'breadcrumb-voice-'));
  process.on('exit', () => rmSync(directory, { recursive: true, force: true }));
  const audio = testTone(); const id = cacheKey(request.text, request.locale, DEFAULT_VOICE);
  await storeAudio(directory, id, audio);
  const names = ['BREADCRUMB_VOICE_DIR', 'BREADCRUMB_ELEVENLABS_VOICE', 'ELEVENLABS_API_KEY', 'ELEVENLABS_VOICE_ID'];
  const saved = names.map((key) => process.env[key]);
  names.forEach((key) => delete process.env[key]);
  process.env.BREADCRUMB_VOICE_DIR = directory; process.env.BREADCRUMB_ELEVENLABS_VOICE = '0';
  try { return { ...await (process.platform === 'win32' ? startWindowsServer(port) : startIsolatedServer(port)), audio, id }; }
  finally { names.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; }); }
}
