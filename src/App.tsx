import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdvancedSettings, Lang, OutputFile, QueueItem, Theme } from './types';
import { DEFAULT_ADVANCED } from './types';
import { STRINGS } from './i18n';
import { defaultTarget, detectCategory, extOf, formatSize, targetsFor } from './lib/detect';

const PREFS_KEY = 'converter-app:prefs:v1';

function loadPrefs(): { lang: Lang; theme: Theme } {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<{ lang: Lang; theme: Theme }>;
      return {
        lang: p.lang === 'ar' ? 'ar' : 'en',
        theme: p.theme === 'light' ? 'light' : 'dark',
      };
    }
  } catch {
    /* ignore */
  }
  return { lang: 'en', theme: 'dark' };
}

let nextId = 1;
function makeItem(file: File): QueueItem {
  const category = detectCategory(file);
  return {
    id: `q${nextId++}`,
    file,
    category,
    target: defaultTarget(category, file),
    status: 'idle',
    progress: 0,
    outputs: [],
  };
}

function downloadOutput(out: OutputFile) {
  const url = URL.createObjectURL(out.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = out.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function App() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [adv, setAdv] = useState<AdvancedSettings>(DEFAULT_ADVANCED);
  const [advOpen, setAdvOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [bundles, setBundles] = useState<OutputFile[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<QueueItem[]>([]);
  itemsRef.current = items;

  const lang = prefs.lang;
  const t = STRINGS[lang];

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dataset.theme = prefs.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', prefs.theme === 'dark' ? '#0b0e14' : '#f4f6fb');
  }, [prefs, lang]);

  const addFiles = useCallback((files: Iterable<File>) => {
    const made = [...files].map(makeItem);
    if (made.length) setItems((prev) => [...prev, ...made]);
  }, []);

  // Paste from clipboard (files copied in a file manager / screenshot tools).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length) addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const patchItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const convertItem = useCallback(
    async (item: QueueItem) => {
      const onProgress = (p: number, note?: string) =>
        patchItem(item.id, { progress: p, note });
      patchItem(item.id, { status: 'working', progress: 0, error: undefined, outputs: [], note: t.converting });
      try {
        let outputs: OutputFile[] = [];
        switch (item.category) {
          case 'image': {
            const { convertImage } = await import('./lib/converters/images');
            outputs = await convertImage(item.file, item.target, adv, onProgress);
            break;
          }
          case 'video':
          case 'audio': {
            const { convertMedia } = await import('./lib/converters/media');
            outputs = await convertMedia(item.file, item.target, adv, (p, phase) =>
              patchItem(item.id, {
                progress: p,
                note: phase === 'load' ? t.loadingFfmpeg : t.converting,
              }),
            );
            break;
          }
          case 'pdf': {
            if (item.target === 'images') {
              const { pdfToImages } = await import('./lib/converters/pdf');
              outputs = await pdfToImages(item.file, onProgress);
            } else {
              const { splitPdf } = await import('./lib/converters/pdf');
              outputs = await splitPdf(item.file, adv);
            }
            break;
          }
          case 'data': {
            const { convertData } = await import('./lib/converters/data');
            outputs = await convertData(item.file, item.target);
            break;
          }
          case 'text': {
            const { convertText } = await import('./lib/converters/text');
            outputs = await convertText(item.file, item.target);
            break;
          }
          case 'archive': {
            const { extractZip } = await import('./lib/converters/archive');
            outputs = await extractZip(item.file);
            break;
          }
          default:
            throw new Error('UNKNOWN_TYPE');
        }
        patchItem(item.id, { status: 'done', progress: 1, outputs, note: undefined });
      } catch (e) {
        const raw = e instanceof Error ? e.message : '';
        let msg = t.errGeneric;
        if (raw === 'UNSUPPORTED') msg = t.errUnsupported;
        else if (raw === 'UNKNOWN_TYPE') msg = t.errUnknownType;
        else if (raw === 'SPLIT_RANGE_MISSING') msg = t.errSplitRange;
        else if (item.category === 'video' || item.category === 'audio') msg = t.errFfmpeg;
        else if (item.category === 'image' && ['heic', 'heif'].includes(extOf(item.file.name))) msg = t.errHeic;
        patchItem(item.id, { status: 'error', progress: 0, error: msg, note: undefined });
      }
    },
    [adv, patchItem, t],
  );

  const convertAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      for (const item of itemsRef.current) {
        if (item.status === 'done') continue;
        if (item.category === 'unknown') {
          patchItem(item.id, { status: 'error', error: t.errUnknownType });
          continue;
        }
        await convertItem(item);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, convertItem, patchItem, t]);

  const allOutputs = useMemo(
    () => items.filter((i) => i.status === 'done').flatMap((i) => i.outputs),
    [items],
  );

  const downloadAll = useCallback(async () => {
    for (const out of allOutputs) {
      downloadOutput(out);
      await new Promise((r) => setTimeout(r, 250));
    }
  }, [allOutputs]);

  const pdfItems = items.filter((i) => i.category === 'pdf');
  const imageItems = items.filter((i) => i.category === 'image');

  const zipAll = useCallback(async () => {
    const { zipFiles } = await import('./lib/converters/archive');
    const out = await zipFiles(itemsRef.current.map((i) => i.file), 'queued-files.zip');
    setBundles((prev) => [...prev, out]);
  }, []);

  const mergePdfs = useCallback(async () => {
    const { mergePdfFiles } = await import('./lib/converters/pdf');
    const files = itemsRef.current.filter((i) => i.category === 'pdf').map((i) => i.file);
    const blob = await mergePdfFiles(files);
    setBundles((prev) => [...prev, { name: 'merged.pdf', blob }]);
  }, []);

  const combineImages = useCallback(async () => {
    const { imageToPdfBytes } = await import('./lib/converters/images');
    const { imagesToPdfBlob } = await import('./lib/converters/pdf');
    const parts = [];
    for (const it of itemsRef.current.filter((i) => i.category === 'image')) {
      parts.push(await imageToPdfBytes(it.file, adv));
    }
    const blob = await imagesToPdfBlob(parts);
    setBundles((prev) => [...prev, { name: 'images-combined.pdf', blob }]);
  }, [adv]);

  const advNum = (key: keyof AdvancedSettings) => ({
    value: adv[key] as string | number,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setAdv((prev) => ({
        ...prev,
        [key]:
          key === 'trimStart' || key === 'trimEnd' || key === 'splitFrom' || key === 'splitTo'
            ? e.target.value
            : Number(e.target.value),
      })),
  });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h13" /><path d="M13 3l4 4-4 4" />
              <path d="M20 17H7" /><path d="M11 13l-4 4 4 4" />
            </svg>
          </span>
          <div>
            <div className="brand-name">
              {t.appName} <span className="brand-accent">— {t.appBrand}</span>
            </div>
            <div className="brand-tag">{t.tagline}</div>
          </div>
        </div>
        <div className="top-actions">
          <span className="badge" title={t.localBadge}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            {t.localBadge}
          </span>
          <button
            type="button"
            className="pill-btn toggle-btn"
            onClick={() => setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))}
          >
            <span className="tgl-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" /></svg>
            </span>
            {prefs.theme === 'dark' ? t.themeLight : t.themeDark}
          </button>
          <button
            type="button"
            className="pill-btn toggle-btn"
            onClick={() => setPrefs((p) => ({ ...p, lang: p.lang === 'en' ? 'ar' : 'en' }))}
          >
            {lang === 'en' ? 'العربية' : 'English'}
          </button>
        </div>
      </header>

      <main>
        <section
          className={`dropzone${dragOver ? ' drag' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
        >
          <div className="dz-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v10" /><path d="M7 8l5-5 5 5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
          </div>
          <div className="dz-title">{dragOver ? t.dropActive : t.dropTitle}</div>
          <div className="dz-hint">{t.dropHint}</div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </section>

        <section className="card">
          <button type="button" className="adv-toggle" onClick={() => setAdvOpen((o) => !o)} aria-expanded={advOpen}>
            <span>{t.advanced}</span>
            <span className={`chev${advOpen ? ' open' : ''}`}>▾</span>
          </button>
          {advOpen && (
            <div className="adv-grid">
              <label>{t.quality}<input type="number" min={10} max={100} {...advNum('quality')} /></label>
              <label>{t.resizePercent}<input type="number" min={1} max={100} {...advNum('resizePercent')} /></label>
              <label>{t.maxDim}<input type="number" min={0} max={10000} {...advNum('maxDim')} /></label>
              <label>
                {t.rotate}
                <select value={adv.rotate} onChange={(e) => setAdv((p) => ({ ...p, rotate: Number(e.target.value) }))}>
                  <option value={0}>0°</option>
                  <option value={90}>90°</option>
                  <option value={180}>180°</option>
                  <option value={270}>270°</option>
                </select>
              </label>
              <label>{t.trimStart}<input type="number" min={0} step="0.1" placeholder="0" {...advNum('trimStart')} /></label>
              <label>{t.trimEnd}<input type="number" min={0} step="0.1" placeholder="∞" {...advNum('trimEnd')} /></label>
              <label>{t.gifFps}<input type="number" min={1} max={30} {...advNum('gifFps')} /></label>
              <label>{t.gifWidth}<input type="number" min={64} max={1920} step={16} {...advNum('gifWidth')} /></label>
              <label>{t.splitFrom}<input type="number" min={1} placeholder="1" {...advNum('splitFrom')} /></label>
              <label>{t.splitTo}<input type="number" min={1} placeholder="2" {...advNum('splitTo')} /></label>
            </div>
          )}
        </section>

        <section className="card">
          <div className="queue-head">
            <h2>{t.queue}</h2>
            <div className="queue-actions">
              {items.length > 0 && (
                <>
                  <button type="button" className="pill-btn" onClick={() => void zipAll()}>{t.zipAll}</button>
                  {pdfItems.length >= 2 && (
                    <button type="button" className="pill-btn" onClick={() => void mergePdfs()}>{t.mergePdfs}</button>
                  )}
                  {imageItems.length >= 2 && (
                    <button type="button" className="pill-btn" onClick={() => void combineImages()}>{t.combineImages}</button>
                  )}
                </>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <p className="empty">{t.queueEmpty}</p>
          ) : (
            <ul className="queue-list">
              {items.map((item) => (
                <li key={item.id} className="q-item">
                  <div className="q-main">
                    <div className="q-file">
                      <span className="q-name">{item.file.name}</span>
                      <span className="q-meta">
                        {formatSize(item.file.size)} · {t.category[item.category]}
                      </span>
                    </div>
                    <div className="q-route">
                      <span className="chip chip-from">{extOf(item.file.name).toUpperCase() || '—'}</span>
                      <span className="arrow">→</span>
                      {item.category === 'unknown' ? (
                        <span className="chip chip-bad">?</span>
                      ) : (
                        <select
                          className="target-select"
                          value={item.target}
                          disabled={item.status === 'working'}
                          onChange={(e) =>
                            patchItem(item.id, { target: e.target.value, status: 'idle', outputs: [], error: undefined })
                          }
                        >
                          {targetsFor(item.category).map((tg) => (
                            <option key={tg} value={tg}>{t.target[tg] || tg.toUpperCase()}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="q-side">
                      {item.status === 'done' ? (
                        item.outputs.map((out) => (
                          <button key={out.name} type="button" className="dl-btn" onClick={() => downloadOutput(out)}>
                            ↓ {out.name}
                          </button>
                        ))
                      ) : item.status === 'working' ? (
                        <span className="status working">{item.note || t.working}</span>
                      ) : item.status === 'error' ? (
                        <span className="status error">{item.error}</span>
                      ) : (
                        <span className="status">{t.ready}</span>
                      )}
                      {item.status !== 'working' && item.category !== 'unknown' && item.status !== 'done' && (
                        <button type="button" className="mini-btn" onClick={() => void convertItem(item)}>
                          {t.convert}
                        </button>
                      )}
                      <button
                        type="button"
                        className="mini-btn ghost"
                        aria-label={t.remove}
                        onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {item.status === 'working' && (
                    <div className="progress"><div className="bar" style={{ width: `${Math.round(item.progress * 100)}%` }} /></div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <div className="queue-foot">
              <button type="button" className="primary-btn" disabled={busy} onClick={() => void convertAll()}>
                {t.convertAll}
              </button>
              {allOutputs.length > 0 && (
                <button type="button" className="pill-btn" onClick={() => void downloadAll()}>{t.downloadAll}</button>
              )}
              <button
                type="button"
                className="pill-btn"
                onClick={() => setItems((prev) => prev.filter((i) => i.status !== 'done'))}
              >
                {t.clearFinished}
              </button>
              <button type="button" className="pill-btn danger" onClick={() => setItems([])}>{t.clearAll}</button>
            </div>
          )}
        </section>

        {bundles.length > 0 && (
          <section className="card">
            <h2>{t.bundles}</h2>
            <div className="bundles">
              {bundles.map((b, i) => (
                <button key={`${b.name}-${i}`} type="button" className="dl-btn" onClick={() => downloadOutput(b)}>
                  ↓ {b.name} ({formatSize(b.blob.size)})
                </button>
              ))}
            </div>
          </section>
        )}

        <p className="footer-note">{t.footerNote}</p>
      </main>
    </div>
  );
}
