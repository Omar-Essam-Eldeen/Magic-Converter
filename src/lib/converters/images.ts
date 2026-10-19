import type { AdvancedSettings, OutputFile } from '../../types';
import { baseName } from '../detect';

/** Decode any browser-supported image (HEIC via heic2any) to an ImageBitmap. */
export async function decodeImage(file: File): Promise<ImageBitmap> {
  const ext = file.name.toLowerCase().split('.').pop() || '';
  let blob: Blob = file;
  if (ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif') {
    const { default: heic2any } = await import('heic2any');
    const out = await heic2any({ blob: file, toType: 'image/png' });
    blob = Array.isArray(out) ? out[0] : out;
  }
  return createImageBitmap(blob);
}

/** Apply resize/rotate and render onto a canvas. */
export function renderToCanvas(bitmap: ImageBitmap, adv: AdvancedSettings): HTMLCanvasElement {
  let scale = (adv.resizePercent || 100) / 100;
  if (adv.maxDim > 0) {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest > adv.maxDim) scale = Math.min(scale, adv.maxDim / longest);
  }
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const rot = ((adv.rotate % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? h : w;
  canvas.height = swap ? w : h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Encode failed'))),
      type,
      quality,
    );
  });
}

/** Rendered image encoded as PNG or JPEG bytes (for embedding in a PDF). */
export async function imageToPdfBytes(
  file: File,
  adv: AdvancedSettings,
): Promise<{ bytes: Uint8Array; width: number; height: number; format: 'png' | 'jpg' }> {
  const bitmap = await decodeImage(file);
  const canvas = renderToCanvas(bitmap, adv);
  bitmap.close();
  // JPEG keeps PDFs small; fall back to PNG if the source has transparency worth keeping.
  const blob = await canvasToBlob(canvas, 'image/png', 1);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes, width: canvas.width, height: canvas.height, format: 'png' };
}

export async function convertImage(
  file: File,
  target: string,
  adv: AdvancedSettings,
  onProgress: (p: number, note?: string) => void,
): Promise<OutputFile[]> {
  onProgress(0.15);
  const bitmap = await decodeImage(file);
  const canvas = renderToCanvas(bitmap, adv);
  bitmap.close();
  onProgress(0.6);

  if (target === 'pdf') {
    const blob = await canvasToBlob(canvas, 'image/png', 1);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { imagesToPdfBlob } = await import('./pdf');
    const pdf = await imagesToPdfBlob([
      { bytes, width: canvas.width, height: canvas.height, format: 'png' },
    ]);
    onProgress(1);
    return [{ name: `${baseName(file.name)}.pdf`, blob: pdf }];
  }

  const mime = target === 'jpg' ? 'image/jpeg' : target === 'webp' ? 'image/webp' : 'image/png';
  if (target === 'jpg') {
    // JPEG has no alpha: flatten onto white first.
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const fctx = flat.getContext('2d');
    if (!fctx) throw new Error('Canvas unavailable');
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(0, 0, flat.width, flat.height);
    fctx.drawImage(canvas, 0, 0);
    const blob = await canvasToBlob(flat, mime, adv.quality / 100);
    onProgress(1);
    return [{ name: `${baseName(file.name)}.jpg`, blob }];
  }

  const blob = await canvasToBlob(canvas, mime, adv.quality / 100);
  onProgress(1);
  return [{ name: `${baseName(file.name)}.${target}`, blob }];
}
