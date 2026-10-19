import type { OutputFile } from '../../types';
import { baseName, extOf } from '../detect';

type Aoa = string[][];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Parse a JSON input into rows: array-of-objects → header + rows; array-of-arrays as-is. */
function jsonToAoa(text: string): Aoa {
  const obj: unknown = JSON.parse(text);
  if (!Array.isArray(obj)) return [[String(obj)]];
  if (obj.length === 0) return [];
  const first = obj[0] as unknown;
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    const header = Object.keys(first as Record<string, unknown>);
    const rows = obj.map((r) =>
      header.map((h) => {
        const v = (r as Record<string, unknown>)[h];
        return v === null || v === undefined ? '' : String(v);
      }),
    );
    return [header, ...rows];
  }
  return obj.map((r) =>
    Array.isArray(r) ? r.map((c) => (c === null || c === undefined ? '' : String(c))) : [String(r)],
  );
}

async function readAoa(file: File): Promise<Aoa> {
  const ext = extOf(file.name);
  if (ext === 'json') {
    return jsonToAoa(await file.text());
  }
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false });
  return aoa.map((row) => row.map((c) => (c === null || c === undefined ? '' : String(c))));
}

function aoaToHtml(title: string, aoa: Aoa): string {
  if (aoa.length === 0) return '<!doctype html><meta charset="utf-8"><table></table>';
  const [head, ...rest] = aoa;
  const th = head.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const trs = rest
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
    .join('');
  return (
    `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
    `<style>body{font-family:'Segoe UI',Arial,sans-serif;margin:24px;color:#263238}` +
    `table{border-collapse:collapse}th,td{border:1px solid #d8dee9;padding:7px 11px}` +
    `th{background:#f2760a;color:#fff}tr:nth-child(even){background:#f4f6fb}</style>` +
    `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`
  );
}

function aoaToMarkdown(aoa: Aoa): string {
  if (aoa.length === 0) return '';
  const [head, ...rest] = aoa;
  const lines = [
    `| ${head.join(' | ')} |`,
    `|${' --- |'.repeat(head.length)}`,
    ...rest.map((r) => `| ${r.join(' | ')} |`),
  ];
  return lines.join('\n');
}

function aoaToTxt(aoa: Aoa): string {
  if (aoa.length === 0) return '';
  const width = Math.max(...aoa.map((r) => r.length));
  const widths: number[] = [];
  for (let i = 0; i < width; i += 1) {
    widths.push(Math.max(...aoa.map((r) => (r[i] || '').length)));
  }
  return aoa
    .map((r) => r.map((c, i) => (c || '').padEnd(widths[i])).join('  ').trimEnd())
    .join('\n');
}

function aoaToJson(aoa: Aoa): string {
  if (aoa.length === 0) return '[]';
  const [head, ...rest] = aoa;
  const objs = rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
  return JSON.stringify(objs, null, 2);
}

export async function convertData(file: File, target: string): Promise<OutputFile[]> {
  const aoa = await readAoa(file);
  const base = baseName(file.name);
  if (target === 'html') {
    return [{ name: `${base}.html`, blob: new Blob([aoaToHtml(file.name, aoa)], { type: 'text/html' }) }];
  }
  if (target === 'md') {
    return [{ name: `${base}.md`, blob: new Blob([aoaToMarkdown(aoa)], { type: 'text/markdown' }) }];
  }
  if (target === 'txt') {
    return [{ name: `${base}.txt`, blob: new Blob([aoaToTxt(aoa)], { type: 'text/plain' }) }];
  }
  if (target === 'json') {
    return [{ name: `${base}.json`, blob: new Blob([aoaToJson(aoa)], { type: 'application/json' }) }];
  }
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  if (target === 'csv' || target === 'tsv') {
    const text = XLSX.utils.sheet_to_csv(ws, { FS: target === 'tsv' ? '\t' : ',' });
    return [{
      name: `${base}.${target}`,
      blob: new Blob([text], { type: target === 'tsv' ? 'text/tab-separated-values' : 'text/csv' }),
    }];
  }
  // xlsx
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return [{
    name: `${base}.xlsx`,
    blob: new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  }];
}
