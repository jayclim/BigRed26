/** Shared browser/server byte limit. This module has no Node imports. */
export const MAX_FRAME_BYTES = 512 * 1024;

export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight) throw new Error('The camera has no frame yet. Try again.');
  const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The camera frame could not be captured.');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));
  if (!blob || blob.type !== 'image/jpeg' || blob.size > MAX_FRAME_BYTES) throw new Error('The camera frame is too large or could not be encoded.');
  return blob;
}
