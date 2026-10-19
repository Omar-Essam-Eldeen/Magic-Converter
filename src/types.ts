export type Category = 'image' | 'video' | 'audio' | 'pdf' | 'data' | 'text' | 'archive' | 'unknown';

export type ItemStatus = 'idle' | 'working' | 'done' | 'error';

export interface OutputFile {
  name: string;
  blob: Blob;
}

export interface QueueItem {
  id: string;
  file: File;
  category: Category;
  /** target format key, e.g. 'png' | 'mp4' | 'gif' | 'csv' | 'images' | 'split' | 'extract' */
  target: string;
  status: ItemStatus;
  /** 0..1 */
  progress: number;
  /** human-readable working note (e.g. "Loading FFmpeg…") */
  note?: string;
  outputs: OutputFile[];
  error?: string;
}

export interface AdvancedSettings {
  /** image quality 10..100 */
  quality: number;
  /** resize percent 1..100 (100 = original) */
  resizePercent: number;
  /** max width/height in px, 0 = no cap */
  maxDim: number;
  /** degrees: 0 | 90 | 180 | 270 */
  rotate: number;
  /** media trim, seconds; '' = unset */
  trimStart: string;
  trimEnd: string;
  /** GIF frames per second */
  gifFps: number;
  /** GIF width px */
  gifWidth: number;
  /** PDF split range, 1-based pages; '' = unset */
  splitFrom: string;
  splitTo: string;
}

export const DEFAULT_ADVANCED: AdvancedSettings = {
  quality: 88,
  resizePercent: 100,
  maxDim: 0,
  rotate: 0,
  trimStart: '',
  trimEnd: '',
  gifFps: 12,
  gifWidth: 480,
  splitFrom: '',
  splitTo: '',
};

export type Lang = 'en' | 'ar';
export type Theme = 'dark' | 'light';
