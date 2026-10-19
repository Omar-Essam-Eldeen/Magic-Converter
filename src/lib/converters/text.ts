import type { OutputFile } from '../../types';
import { baseName, extOf } from '../detect';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Markdown → HTML: same deliberately-small subset as the desktop engine
 *  (headings, simple list items, paragraphs; everything escaped). */
export function mdToHtml(md: string): string {
  const out: string[] = [];
  for (const line of md.split('\n')) {
    const s = line.replace(/\s+$/, '');
    if (s.startsWith('### ')) out.push(`<h3>${escapeHtml(s.slice(4))}</h3>`);
    else if (s.startsWith('## ')) out.push(`<h2>${escapeHtml(s.slice(3))}</h2>`);
    else if (s.startsWith('# ')) out.push(`<h1>${escapeHtml(s.slice(2))}</h1>`);
    else if (s.startsWith('- ') || s.startsWith('* ')) out.push(`<li>${escapeHtml(s.slice(2))}</li>`);
    else if (s.trim()) out.push(`<p>${escapeHtml(s)}</p>`);
  }
  return out.join('\n');
}

function htmlToPlain(htmlText: string): string {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  return (doc.body?.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export async function convertText(file: File, target: string): Promise<OutputFile[]> {
  const ext = extOf(file.name);
  const raw = await file.text();
  const base = baseName(file.name);
  const mime = target === 'html' ? 'text/html' : target === 'md' ? 'text/markdown' : 'text/plain';

  if (target === 'html') {
    const body =
      ext === 'md' || ext === 'markdown'
        ? mdToHtml(raw)
        : ext === 'html' || ext === 'htm'
          ? raw
          : `<pre>${escapeHtml(raw)}</pre>`;
    const page = `<!doctype html><meta charset="utf-8"><body>\n${body}\n</body>`;
    return [{ name: `${base}.html`, blob: new Blob([page], { type: mime }) }];
  }
  if (target === 'txt' || target === 'md') {
    // txt and md targets both take the plain-text content; for HTML inputs we
    // strip tags (DOMParser keeps it honest), for txt/md inputs it's as-is.
    const text = ext === 'html' || ext === 'htm' ? htmlToPlain(raw) : raw;
    return [{ name: `${base}.${target}`, blob: new Blob([text], { type: mime }) }];
  }
  throw new Error('UNSUPPORTED');
}
