import type { Category } from '../types';

export function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'heic', 'heif', 'avif', 'tif', 'tiff', 'svg', 'ico']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'm4v', 'flv']);
const AUDIO_EXTS = new Set(['mp3', 'm4a', 'wav', 'flac', 'ogg', 'opus', 'aac', 'aiff', 'aif', 'wma']);
const DATA_EXTS = new Set(['csv', 'tsv', 'json', 'xlsx', 'xls', 'ods']);
const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'html', 'htm']);

export function detectCategory(file: File): Category {
  const ext = extOf(file.name);
  const type = file.type || '';
  if (IMAGE_EXTS.has(ext) || type.startsWith('image/')) return 'image';
  if (VIDEO_EXTS.has(ext) || type.startsWith('video/')) return 'video';
  if (AUDIO_EXTS.has(ext) || type.startsWith('audio/')) return 'audio';
  if (ext === 'pdf' || type === 'application/pdf') return 'pdf';
  if (DATA_EXTS.has(ext)) return 'data';
  if (TEXT_EXTS.has(ext) || type === 'text/plain' || type === 'text/markdown' || type === 'text/html') return 'text';
  if (ext === 'zip' || type === 'application/zip' || type === 'application/x-zip-compressed') return 'archive';
  return 'unknown';
}

/** Output targets genuinely offered per category (no dead buttons). */
export function targetsFor(category: Category): string[] {
  switch (category) {
    case 'image':
      return ['png', 'jpg', 'webp', 'pdf'];
    case 'video':
      return ['mp4', 'webm', 'gif', 'mp3', 'wav'];
    case 'audio':
      return ['mp3', 'wav'];
    case 'pdf':
      return ['images', 'split'];
    case 'data':
      return ['csv', 'tsv', 'json', 'xlsx', 'html', 'md', 'txt'];
    case 'text':
      return ['txt', 'md', 'html'];
    case 'archive':
      return ['extract'];
    default:
      return [];
  }
}

export function defaultTarget(category: Category, file: File): string {
  const ext = extOf(file.name);
  switch (category) {
    case 'image':
      return ext === 'heic' || ext === 'heif' ? 'jpg' : ext === 'png' ? 'webp' : 'png';
    case 'video':
      return 'mp4';
    case 'audio':
      return ext === 'mp3' ? 'wav' : 'mp3';
    case 'pdf':
      return 'images';
    case 'data':
      return ext === 'csv' ? 'xlsx' : 'csv';
    case 'text':
      return ext === 'md' || ext === 'markdown' ? 'html' : 'txt';
    case 'archive':
      return 'extract';
    default:
      return '';
  }
}

export function outputExtFor(target: string): string {
  if (target === 'images') return 'png';
  if (target === 'split') return 'pdf';
  return target;
}
