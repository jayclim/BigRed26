export const COMPRESSION_UNSUPPORTED = 'This browser cannot compress this video. Try desktop Chrome or Edge, or trim the clip on your phone.';

export function targetSize(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
    throw new Error('The video dimensions must be at least 2 pixels.');
  }
  const scale = Math.min(1, 1920 / Math.max(width, height), 1080 / Math.min(width, height));
  return {
    width: Math.max(2, Math.floor(width * scale / 2) * 2),
    height: Math.max(2, Math.floor(height * scale / 2) * 2),
  };
}

export function requiredTrackLoss<T extends object>(
  discardedTracks: readonly { track: T }[],
  inputTracks: { primaryVideo: T | null; audioTracks: readonly T[] },
): string | null {
  if (discardedTracks.some(({ track }) => track === inputTracks.primaryVideo)) {
    return 'The primary video track cannot be preserved.';
  }
  if (discardedTracks.some(({ track }) => inputTracks.audioTracks.includes(track))) {
    return 'An audio track cannot be preserved.';
  }
  return null;
}

export async function compressVideo(file: File, { onProgress, signal }: {
  onProgress?: (progress: number) => void; signal?: AbortSignal;
} = {}): Promise<File> {
  const abortError = () => new DOMException('Video compression canceled.', 'AbortError');
  if (signal?.aborted) throw abortError();
  if (typeof globalThis.VideoEncoder === 'undefined') throw new Error(COMPRESSION_UNSUPPORTED);
  const mb = await import('mediabunny');
  if (signal?.aborted) throw abortError();
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target });
  let conversion: Awaited<ReturnType<typeof mb.Conversion.init>> | undefined;
  const abort = () => {
    void conversion?.cancel().catch(() => {});
    input.dispose();
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const primaryVideo = await input.getPrimaryVideoTrack();
    const audioTracks = await input.getAudioTracks();
    if (!primaryVideo) throw new Error('No primary video track was found.');
    conversion = await mb.Conversion.init({
      input, output, showWarnings: false,
      video: async (track) => {
        const size = targetSize(await track.getDisplayWidth(), await track.getDisplayHeight());
        const stats = await track.computePacketStats();
        const avc = await mb.canEncodeVideo('avc', { ...size, bitrate: mb.QUALITY_HIGH });
        if (signal?.aborted) throw abortError();
        return {
          ...size, fit: 'contain',
          ...(stats.averagePacketRate > 30 ? { frameRate: 30 } : {}),
          ...(avc ? { codec: 'avc' as const } : {}),
          bitrate: mb.QUALITY_HIGH,
        };
      },
      audio: { codec: 'aac', bitrate: mb.QUALITY_HIGH },
    });
    if (signal?.aborted) { await conversion.cancel(); throw abortError(); }
    const loss = requiredTrackLoss(conversion.discardedTracks, { primaryVideo, audioTracks });
    if (!conversion.isValid || loss) {
      const reasons = conversion.discardedTracks.map(({ reason }) => reason).join(', ');
      throw new Error(`${loss ?? 'The conversion is not supported.'}${reasons ? ` Unsupported tracks: ${reasons}.` : ''}`);
    }
    conversion.onProgress = (progress) => {
      if (!signal?.aborted) onProgress?.(progress);
    };
    await conversion.execute();
    if (signal?.aborted) throw abortError();
    if (!target.buffer) throw new Error('No compressed video was produced.');
    const base = file.name.replace(/\.[^.]+$/, '') || 'video';
    return new File([target.buffer], `${base}-compressed.mp4`, { type: 'video/mp4' });
  } catch (error) {
    if (conversion && conversion.state !== 'done') await conversion.cancel().catch(() => {});
    if (signal?.aborted) throw abortError();
    throw new Error(`${COMPRESSION_UNSUPPORTED}${error instanceof Error ? ` ${error.message}` : ''}`);
  } finally {
    signal?.removeEventListener('abort', abort);
    input.dispose();
  }
}
