import type { OutputFile } from '../../types';
import { baseName } from '../detect';

/** Zip the given files (originals, unchanged) into one .zip blob. */
export async function zipFiles(files: File[], zipName: string): Promise<OutputFile> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const used = new Set<string>();
  for (const f of files) {
    let name = f.name;
    let n = 1;
    while (used.has(name)) {
      const dot = f.name.lastIndexOf('.');
      name = dot > 0 ? `${f.name.slice(0, dot)} (${n})${f.name.slice(dot)}` : `${f.name} (${n})`;
      n += 1;
    }
    used.add(name);
    zip.file(name, f);
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { name: zipName, blob };
}

/** Extract a ZIP: every entry becomes its own downloadable output. */
export async function extractZip(file: File): Promise<OutputFile[]> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(file);
  const outputs: OutputFile[] = [];
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  for (const entry of entries) {
    const blob = await entry.async('blob');
    // Flatten folder paths so downloads have sane names.
    const flat = entry.name.split('/').filter(Boolean).join('_') || `${baseName(file.name)}-file`;
    outputs.push({ name: flat, blob });
  }
  return outputs;
}
