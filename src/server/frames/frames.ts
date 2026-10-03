import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, stat, unlink, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import type { Result } from '../../../contracts/contracts.ts';
import { MAX_FRAME_BYTES } from '../../features/guide/frameCapture.ts';

const ID = /^frame_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const directory = () => process.env.BREADCRUMB_FRAMES_DIR ?? '.data/frames';
const invalid = (message: string): Result<never> => ({ ok: false, error: { code: 'INVALID_INPUT', message, retryable: false } });
const unavailable = (): Result<never> => ({ ok: false, error: { code: 'PROVIDER_UNAVAILABLE', message: 'Frame storage is unavailable. Retry the upload.', retryable: true } });
// Serialize saves so simultaneous uploads cannot exceed the retention count.
let saving: Promise<unknown> = Promise.resolve();
export function saveFrame(bytes: Uint8Array, dir = directory(), now: () => number = Date.now): Promise<Result<{ mediaId: string }>> {
  if (!bytes.length || bytes.length > MAX_FRAME_BYTES) return Promise.resolve(invalid('Frame is empty or exceeds the byte limit.'));
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return Promise.resolve(invalid('Frame must have a JPEG header.'));
  const task = saving.then(async (): Promise<Result<{ mediaId: string }>> => {
    const mediaId = `frame_${randomUUID()}`;
    const path = join(dir, `${mediaId}.jpg`);
    try {
      await mkdir(dir, { recursive: true });
      const timestamp = now();
      const files = await Promise.all((await readdir(dir)).filter((name) => ID.test(name.replace(/\.jpg$/, '')) && name.endsWith('.jpg'))
        .map(async (name) => ({ name, time: (await stat(join(dir, name))).mtimeMs })));
      const kept = files.filter((f) => f.time >= timestamp - 10 * 60 * 1000).sort((a, b) => a.time - b.time || a.name.localeCompare(b.name));
      const remove = [...files.filter((f) => f.time < timestamp - 10 * 60 * 1000), ...kept.slice(0, Math.max(0, kept.length - 199))];
      await Promise.all(remove.map((f) => unlink(join(dir, f.name))));
      await writeFile(path, bytes, { flag: 'wx' });
      await utimes(path, timestamp / 1000, timestamp / 1000);
      return { ok: true, value: { mediaId } };
    } catch {
      await unlink(path).catch(() => {});
      return unavailable();
    }
  });
  saving = task.catch(() => {});
  return task;
}

export async function readFrame(mediaId: string, dir = directory()): Promise<Result<Uint8Array>> {
  if (!ID.test(mediaId)) return invalid('Invalid frame id.');
  try { return { ok: true, value: await readFile(join(dir, `${mediaId}.jpg`)) }; }
  catch { return { ok: false, error: { code: 'NOT_FOUND', message: 'Frame not found.', retryable: false } }; }
}
