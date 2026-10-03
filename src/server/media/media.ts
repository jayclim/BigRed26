import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Result } from '../../../contracts/contracts.ts';
import { isMediaType, MEDIA_EXTENSIONS, MEDIA_LIMIT_TEXT, mediaInputError } from '../../shared/mediaLimits.ts';

export interface StoredMedia {
  mediaId: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  extraction: 'pending';
}

// Header validation checks the container signature, not codecs or playable footage.
export function validateMedia(file: { type: string; size: number }, header: Uint8Array): Result<{ extension: string }> {
  const message = mediaInputError(file);
  if (message) return { ok: false, error: { code: 'INVALID_INPUT', message, retryable: false } };
  const matches = file.type === 'video/webm'
    ? [0x1a, 0x45, 0xdf, 0xa3].every((byte, i) => header[i] === byte)
    : [0x66, 0x74, 0x79, 0x70].every((byte, i) => header[i + 4] === byte);
  if (!matches || !isMediaType(file.type)) return {
    ok: false,
    error: { code: 'INVALID_INPUT', message: `The video header does not match its file type. ${MEDIA_LIMIT_TEXT}`, retryable: false },
  };
  return { ok: true, value: { extension: MEDIA_EXTENSIONS[file.type] } };
}

export function mediaDirectory(): string {
  return resolve(process.env.BREADCRUMB_MEDIA_DIR ?? join(dirname(resolve(process.env.BREADCRUMB_DATA_FILE ?? '.data/store.json')), 'media'));
}

function displayName(name: string): string {
  return (name.split(/[\\/]/).pop() ?? '')
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
    .trim().slice(0, 180) || 'Route video';
}

export async function storeMedia(file: File, directory = mediaDirectory()): Promise<Result<StoredMedia>> {
  const validation = validateMedia(file, new Uint8Array(await file.slice(0, 8).arrayBuffer()));
  if (!validation.ok) return validation;

  const id = randomUUID();
  const mediaPath = join(directory, `${id}.${validation.value.extension}`);
  const metadataPath = join(directory, `${id}.json`);
  const mediaTemp = `${mediaPath}.tmp`;
  const metadataTemp = `${metadataPath}.tmp`;
  const metadata = { id, originalName: displayName(file.name), type: file.type, size: file.size, uploadedAt: new Date().toISOString() };
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(mediaTemp, new Uint8Array(await file.arrayBuffer()), { flag: 'wx' });
    await writeFile(metadataTemp, JSON.stringify(metadata), { flag: 'wx' });
    await rename(mediaTemp, mediaPath);
    // Metadata is published last. Only a completed pair receives a success response.
    await rename(metadataTemp, metadataPath);
  } catch {
    const cleanup = await Promise.allSettled([mediaTemp, metadataTemp, mediaPath, metadataPath].map((path) => rm(path, { force: true })));
    const clean = cleanup.every((result) => result.status === 'fulfilled');
    return { ok: false, error: {
      code: 'PROVIDER_UNAVAILABLE', retryable: true,
      message: clean
        ? 'The video could not be stored locally. The partial upload was removed. Retry the upload.'
        : 'The video could not be stored locally, and cleanup could not finish. Check local storage, then retry the upload.',
    } };
  }
  return { ok: true, value: {
    mediaId: id, name: metadata.originalName, type: metadata.type, size: metadata.size,
    uploadedAt: metadata.uploadedAt, extraction: 'pending',
  } };
}
