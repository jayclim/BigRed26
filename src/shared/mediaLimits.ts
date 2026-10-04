// Shared by the picker and server. MB means 1024 * 1024 bytes here.
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
// Leave room for multipart boundaries and headers around a file at the limit.
export const MAX_MEDIA_REQUEST_BYTES = MAX_MEDIA_BYTES + 20 * 1024;
export const MEDIA_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';
export const MEDIA_LIMIT_TEXT = 'Choose an MP4, MOV or WebM video, up to 100 MB.';
export const MEDIA_EXTENSIONS = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
} as const;
export type MediaType = keyof typeof MEDIA_EXTENSIONS;

export function isMediaType(type: string): type is MediaType {
  return Object.hasOwn(MEDIA_EXTENSIONS, type);
}

export function mediaInputError(file: { type: string; size: number }): string | null {
  if (file.size === 0) return `This video is empty (0 bytes). ${MEDIA_LIMIT_TEXT}`;
  if (file.size > MAX_MEDIA_BYTES) return `This video is larger than 100 MB. ${MEDIA_LIMIT_TEXT}`;
  if (!isMediaType(file.type)) return `This file type is not supported. ${MEDIA_LIMIT_TEXT}`;
  return null;
}

// Picker only: supported oversized files can be compressed before server validation.
export function mediaPickError(file: { type: string; size: number }): string | null {
  if (file.size === 0) return `This video is empty (0 bytes). ${MEDIA_LIMIT_TEXT}`;
  if (!isMediaType(file.type)) return `This file type is not supported. ${MEDIA_LIMIT_TEXT}`;
  return null;
}
