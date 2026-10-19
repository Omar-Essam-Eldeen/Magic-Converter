import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import type { AdvancedSettings, OutputFile } from '../../types';
import { baseName, extOf } from '../detect';

/**
 * FFmpeg.wasm, lazy-loaded on the first media job from a pinned CDN.
 * This is the ONLY network the app ever does for conversions — the files
 * themselves never leave the device.
 */
const CORE_VERSION = '0.12.6';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

let ffmpeg: FFmpeg | null = null;
let loaded = false;
let loading: Promise<void> | null = null;

/** Fetch a URL to a blob URL while reporting download progress (0..1). */
async function fetchToBlobUrl(url: string, mime: string, onProgress: (p: number) => void): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to load ${url}`);
  const total = Number(res.headers.get('Content-Length') || 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (total > 0) onProgress(Math.min(1, received / total));
    }
  }
  const blob = new Blob(chunks as BlobPart[], { type: mime });
  return URL.createObjectURL(blob);
}

export async function ensureFfmpeg(onLoadProgress: (p: number) => void): Promise<FFmpeg> {
  if (!ffmpeg) ffmpeg = new FFmpeg();
  if (loaded) return ffmpeg;
  if (!loading) {
    const ff = ffmpeg;
    loading = (async () => {
      const [coreURL, wasmURL] = await Promise.all([
        fetchToBlobUrl(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript', () => undefined),
        fetchToBlobUrl(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm', onLoadProgress),
      ]);
      await ff.load({ coreURL, wasmURL });
      loaded = true;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  await loading;
  return ffmpeg;
}

function buildArgs(
  inName: string,
  outName: string,
  target: string,
  adv: AdvancedSettings,
): string[] {
  const args: string[] = ['-i', inName];
  // Trim (output seeking): -ss start, -t duration.
  const start = parseFloat(adv.trimStart);
  const end = parseFloat(adv.trimEnd);
  if (!Number.isNaN(start) && adv.trimStart !== '') args.push('-ss', String(start));
  if (!Number.isNaN(end) && adv.trimEnd !== '') {
    const from = !Number.isNaN(start) && adv.trimStart !== '' ? start : 0;
    args.push('-t', String(Math.max(0.1, end - from)));
  }
  switch (target) {
    case 'mp4':
      args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart');
      break;
    case 'webm':
      args.push('-c:v', 'libvpx', '-b:v', '1400k', '-c:a', 'libvorbis', '-b:a', '128k');
      break;
    case 'gif':
      args.push('-vf',
        `fps=${adv.gifFps},scale=${adv.gifWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`);
      break;
    case 'mp3':
      args.push('-vn', '-c:a', 'libmp3lame', '-q:a', '2');
      break;
    case 'wav':
      args.push('-vn', '-c:a', 'pcm_s16le');
      break;
    default:
      break;
  }
  args.push(outName);
  return args;
}

export async function convertMedia(
  file: File,
  target: string,
  adv: AdvancedSettings,
  onProgress: (p: number, phase: 'load' | 'convert') => void,
): Promise<OutputFile[]> {
  const ff = await ensureFfmpeg((p) => onProgress(p, 'load'));
  const ext = extOf(file.name) || 'bin';
  const inName = `input.${ext}`;
  const outName = `output.${target}`;
  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress(Math.min(1, Math.max(0, progress)), 'convert');
  };
  ff.on('progress', progressHandler);
  try {
    await ff.writeFile(inName, await fetchFile(file));
    const code = await ff.exec(buildArgs(inName, outName, target, adv));
    if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
    const data = await ff.readFile(outName);
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const mime =
      target === 'mp4' ? 'video/mp4'
      : target === 'webm' ? 'video/webm'
      : target === 'gif' ? 'image/gif'
      : target === 'mp3' ? 'audio/mpeg'
      : 'audio/wav';
    const blob = new Blob([bytes as BlobPart], { type: mime });
    onProgress(1, 'convert');
    return [{ name: `${baseName(file.name)}.${target}`, blob }];
  } finally {
    ff.off('progress', progressHandler);
    await ff.deleteFile(inName).catch(() => undefined);
    await ff.deleteFile(outName).catch(() => undefined);
  }
}
