import type { AdvancedSettings, OutputFile } from '../../types';
import { baseName } from '../detect';

/** Re-throw password/encryption failures as the stable code PDF_PASSWORD. */
function rethrowPdfError(e: unknown): never {
  const err = e as { name?: string; message?: string } | null;
  const msg = err?.message || '';
  if (err?.name === 'PasswordException' || /password|encrypted/i.test(msg)) {
    throw new Error('PDF_PASSWORD');
  }
  throw e;
}

export interface PdfImageInput {
  bytes: Uint8Array;
  width: number;
  height: number;
  format: 'png' | 'jpg';
}

/** One PDF with each image on its own page, sized to the image. */
export async function imagesToPdfBlob(images: PdfImageInput[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  for (const img of images) {
    const embedded = img.format === 'png' ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** Render every PDF page to a PNG output (pdf.js, lazy). */
export async function pdfToImages(
  file: File,
  onProgress: (p: number, note?: string) => void,
): Promise<OutputFile[]> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    pdf = await pdfjs.getDocument({ data }).promise;
  } catch (e) {
    throw rethrowPdfError(e);
  }
  const outputs: OutputFile[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encode failed'))), 'image/png'),
    );
    outputs.push({ name: `${baseName(file.name)}-page-${i}.png`, blob });
    onProgress(i / pdf.numPages, `${i}/${pdf.numPages}`);
  }
  await pdf.destroy();
  return outputs;
}

/** Merge several PDFs (in queue order) into one document. */
export async function mergePdfFiles(files: File[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (const f of files) {
    let src: Awaited<ReturnType<typeof PDFDocument.load>>;
    try {
      src = await PDFDocument.load(new Uint8Array(await f.arrayBuffer()));
    } catch (e) {
      throw rethrowPdfError(e);
    }
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const p of pages) out.addPage(p);
  }
  const bytes = await out.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** Extract a 1-based inclusive page range into a new PDF. */
export async function splitPdf(
  file: File,
  adv: AdvancedSettings,
): Promise<OutputFile[]> {
  const { PDFDocument } = await import('pdf-lib');
  let src: Awaited<ReturnType<typeof PDFDocument.load>>;
  try {
    src = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    throw rethrowPdfError(e);
  }
  const total = src.getPageCount();
  const fromRaw = parseInt(adv.splitFrom, 10);
  const toRaw = parseInt(adv.splitTo, 10);
  if (Number.isNaN(fromRaw) && Number.isNaN(toRaw)) {
    throw new Error('SPLIT_RANGE_MISSING');
  }
  const from = Math.min(Math.max(1, Number.isNaN(fromRaw) ? 1 : fromRaw), total);
  const to = Math.min(Math.max(from, Number.isNaN(toRaw) ? total : toRaw), total);
  const out = await PDFDocument.create();
  const indices: number[] = [];
  for (let i = from; i <= to; i += 1) indices.push(i - 1);
  const pages = await out.copyPages(src, indices);
  for (const p of pages) out.addPage(p);
  const bytes = await out.save();
  return [{
    name: `${baseName(file.name)}-pages-${from}-${to}.pdf`,
    blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
  }];
}
