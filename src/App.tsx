import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdvancedSettings, Category, Lang, OutputFile, QueueItem, Theme } from './types';
import { DEFAULT_ADVANCED } from './types';
import { STRINGS, targetLabel } from './i18n';
import { defaultTarget, detectCategory, extOf, formatSize, targetsFor } from './lib/detect';
import {
  clearHistory,
  loadHistory,
  recordUse,
  sortedHistory,
  toggleFavourite,
  type HistoryEntry,
} from './lib/history';
import { applyNamePattern } from './lib/naming';
import { explainError } from './lib/errors';
import { takeSharedFiles } from './lib/shareInbox';

/* ---------------- prefs ---------------- */

const PREFS_KEY = 'converter-app:prefs:v1';

type PresetKey = 'small' | 'balanced' | 'best';
type QualityPresetChoice = PresetKey | 'custom';

interface Prefs {
  lang: Lang;
  theme: Theme;
  /** remembered default target per category (Feature 2) */
  categoryTargets: Partial<Record<Category, string>>;
  /** output name pattern (Feature 3), '' = keep original names */
  namePattern: string;
  /** persisted Advanced options (Feature 4) */
  advanced: AdvancedSettings;
  /** derived from `advanced`; persisted for convenience */
  qualityPreset: QualityPresetChoice;
}

const PRESET_VALUES: Record<PresetKey, Pick<AdvancedSettings, 'quality' | 'maxDim' | 'gifFps' | 'gifWidth'>> = {
  small: { quality: 60, maxDim: 1600, gifFps: 10, gifWidth: 480 },
  balanced: { quality: 80, maxDim: 2560, gifFps: 12, gifWidth: 720 },
  best: { quality: 95, maxDim: 0, gifFps: 15, gifWidth: 1080 },
};

/** The preset whose four controlled fields match these values, if any. */
function matchPreset(adv: AdvancedSettings): PresetKey | null {
  for (const key of Object.keys(PRESET_VALUES) as PresetKey[]) {
    const v = PRESET_VALUES[key];
    if (
      adv.quality === v.quality &&
      adv.maxDim === v.maxDim &&
      adv.gifFps === v.gifFps &&
      adv.gifWidth === v.gifWidth
    ) {
      return key;
    }
  }
  return null;
}

const ALL_CATEGORIES: Category[] = ['image', 'video', 'audio', 'pdf', 'data', 'text', 'archive', 'unknown'];

function sanitizeAdvanced(raw: unknown): AdvancedSettings | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const num = (k: keyof AdvancedSettings, d: number) =>
    typeof r[k] === 'number' && Number.isFinite(r[k] as number) ? (r[k] as number) : d;
  const str = (k: keyof AdvancedSettings) => (typeof r[k] === 'string' ? (r[k] as string) : '');
  return {
    quality: num('quality', DEFAULT_ADVANCED.quality),
    resizePercent: num('resizePercent', DEFAULT_ADVANCED.resizePercent),
    maxDim: num('maxDim', DEFAULT_ADVANCED.maxDim),
    rotate: num('rotate', DEFAULT_ADVANCED.rotate),
    trimStart: str('trimStart'),
    trimEnd: str('trimEnd'),
    gifFps: num('gifFps', DEFAULT_ADVANCED.gifFps),
    gifWidth: num('gifWidth', DEFAULT_ADVANCED.gifWidth),
    splitFrom: str('splitFrom'),
    splitTo: str('splitTo'),
  };
}

function loadPrefs(): Prefs {
  // Fresh installs start on the Balanced preset (Feature 4 default).
  const fresh: Prefs = {
    lang: 'en',
    theme: 'dark',
    categoryTargets: {},
    namePattern: '',
    advanced: { ...DEFAULT_ADVANCED, ...PRESET_VALUES.balanced },
    qualityPreset: 'balanced',
  };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return fresh;
    const p = JSON.parse(raw) as Record<string, unknown>;
    const categoryTargets: Partial<Record<Category, string>> = {};
    if (p.categoryTargets && typeof p.categoryTargets === 'object') {
      for (const [k, v] of Object.entries(p.categoryTargets as Record<string, unknown>)) {
        if (typeof v === 'string' && (ALL_CATEGORIES as string[]).includes(k)) {
          categoryTargets[k as Category] = v;
        }
      }
    }
    // Returning users keep their saved advanced values untouched; the
    // preset indicator simply reflects whether they match a preset.
    const advanced = sanitizeAdvanced(p.advanced) ?? fresh.advanced;
    return {
      lang: p.lang === 'ar' ? 'ar' : 'en',
      theme: p.theme === 'light' ? 'light' : 'dark',
      categoryTargets,
      namePattern: typeof p.namePattern === 'string' ? p.namePattern : '',
      advanced,
      qualityPreset: matchPreset(advanced) ?? 'custom',
    };
  } catch {
    return fresh;
  }
}

/* ---------------- queue items / naming ---------------- */

let nextId = 1;
function makeItem(file: File, category: Category, targetOverride?: string): QueueItem {
  return {
    id: `q${nextId++}`,
    file,
    category,
    target:
      targetOverride && targetsFor(category).includes(targetOverride)
        ? targetOverride
        : defaultTarget(category, file),
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

/**
 * Apply the output name pattern to a finished item's outputs. Extracted ZIP
 * contents are never renamed (their names are the archive's own). If the
 * pattern yields a name without an extension, the output's real extension is
 * re-attached; duplicate results are disambiguated with " (2)", " (3)"…
 */
function renameOutputs(item: QueueItem, outputs: OutputFile[], pattern: string): OutputFile[] {
  if (!pattern.trim() || item.category === 'archive' || outputs.length === 0) return outputs;
  const renamed = outputs.map((out, i) => {
    let name = applyNamePattern(item.file.name, pattern, { target: item.target, index: i + 1 });
    if (!name) return out;
    if (!/\.[a-z0-9]+$/i.test(name)) {
      const ext = extOf(out.name);
      if (ext) name = `${name}.${ext}`;
    }
    return name === out.name ? out : { ...out, name };
  });
  const used = new Set<string>();
  return renamed.map((out) => {
    if (!used.has(out.name)) {
      used.add(out.name);
      return out;
    }
    const dot = out.name.lastIndexOf('.');
    let n = 2;
    let candidate =
      dot > 0 ? `${out.name.slice(0, dot)} (${n})${out.name.slice(dot)}` : `${out.name} (${n})`;
    while (used.has(candidate)) {
      n += 1;
      candidate =
        dot > 0 ? `${out.name.slice(0, dot)} (${n})${out.name.slice(dot)}` : `${out.name} (${n})`;
    }
    used.add(candidate);
    return { ...out, name: candidate };
  });
}

/** Rename a bundle file (merged.pdf, images-combined.pdf, queued-files.zip). */
function bundleFileName(baseWithExt: string, target: string, pattern: string): string {
  if (!pattern.trim()) return baseWithExt;
  let name = applyNamePattern(baseWithExt, pattern, { target, index: 1 });
  if (!name) return baseWithExt;
  if (!/\.[a-z0-9]+$/i.test(name)) {
    const ext = extOf(baseWithExt);
    if (ext) name = `${name}.${ext}`;
  }
  return name;
}

interface ArmedRoute {
  key: string;
  category: Category;
  target: string;
}

/** Targets that read best as a bare upper-cased extension on quick chips. */
const EXT_CHIP_TARGETS = new Set([
  'png', 'jpg', 'webp', 'mp4', 'webm', 'gif', 'mp3', 'wav',
  'csv', 'tsv', 'json', 'xlsx', 'md', 'txt', 'pdf',
]);

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [advOpen, setAdvOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [bundles, setBundles] = useState<OutputFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [armed, setArmedState] = useState<ArmedRoute | null>(null);
  const [announce, setAnnounce] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<QueueItem[]>([]);
  itemsRef.current = items;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const armedRef = useRef<ArmedRoute | null>(null);

  const setArmed = useCallback((a: ArmedRoute | null) => {
    armedRef.current = a;
    setArmedState(a);
  }, []);

  /* ----- drop-zone 3D tilt + shine (v1.2, design only) -----
     Gentle pointer-driven tilt, lerped via rAF. Only for fine pointers
     (mouse/pen) on hover-capable devices, never under reduced-motion,
     and paused while a drag hovers the zone. Purely decorative: all
     existing click / keyboard / drag behaviour is untouched. */
  const dzRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef(false);
  const tiltRef = useRef({ raf: 0, cx: 0, cy: 0, tx: 0, ty: 0, running: false });

  const tiltStep = useCallback(() => {
    const el = dzRef.current;
    const s = tiltRef.current;
    if (!el) {
      s.running = false;
      return;
    }
    s.cx += (s.tx - s.cx) * 0.14;
    s.cy += (s.ty - s.cy) * 0.14;
    const settled =
      Math.abs(s.tx - s.cx) < 0.02 && Math.abs(s.ty - s.cy) < 0.02;
    if (settled) {
      // Park at the target angle (or clear fully when back to flat);
      // the next pointer move re-kicks the loop.
      if (s.tx === 0 && s.ty === 0) {
        el.style.transform = '';
        el.classList.remove('tilt-on');
      } else {
        el.style.transform = `perspective(900px) rotateX(${s.ty.toFixed(2)}deg) rotateY(${s.tx.toFixed(2)}deg)`;
      }
      s.running = false;
      return;
    }
    el.style.transform = `perspective(900px) rotateX(${s.cy.toFixed(2)}deg) rotateY(${s.cx.toFixed(2)}deg)`;
    s.raf = requestAnimationFrame(tiltStep);
  }, []);

  const tiltKick = useCallback(() => {
    const s = tiltRef.current;
    if (!s.running) {
      s.running = true;
      s.raf = requestAnimationFrame(tiltStep);
    }
  }, [tiltStep]);

  useEffect(
    () => () => {
      if (tiltRef.current.raf) cancelAnimationFrame(tiltRef.current.raf);
      tiltRef.current.running = false;
    },
    [],
  );

  const tiltAllowed = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const onDzPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const el = dzRef.current;
    if (!el || dragRef.current || !tiltAllowed()) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    el.classList.add('tilt-on');
    // Max ±4° on each axis.
    tiltRef.current.tx = (px - 0.5) * 8;
    tiltRef.current.ty = (0.5 - py) * 8;
    tiltKick();
  };

  const onDzPointerLeave = () => {
    tiltRef.current.tx = 0;
    tiltRef.current.ty = 0;
    tiltKick(); // eases back to flat, then clears the inline transform
  };

  const lang = prefs.lang;
  const t = STRINGS[lang];
  const adv = prefs.advanced;

  const setAdv = useCallback(
    (update: AdvancedSettings | ((prev: AdvancedSettings) => AdvancedSettings)) => {
      setPrefs((p) => {
        const advanced =
          typeof update === 'function'
            ? (update as (prev: AdvancedSettings) => AdvancedSettings)(p.advanced)
            : update;
        return { ...p, advanced, qualityPreset: matchPreset(advanced) ?? 'custom' };
      });
    },
    [],
  );

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

  const addFiles = useCallback(
    (files: Iterable<File>) => {
      const list = [...files];
      if (!list.length) return;
      let arm = armedRef.current;
      let consumed = false;
      const made = list.map((file) => {
        const category = detectCategory(file);
        let target: string | undefined;
        if (arm && arm.category === category) {
          // One-shot armed route (Feature 1) wins for the next matching file.
          target = arm.target;
          arm = null;
          consumed = true;
        } else {
          // Remembered per-category default (Feature 2).
          target = prefsRef.current.categoryTargets[category];
        }
        return makeItem(file, category, target);
      });
      if (consumed) setArmed(null);
      setItems((prev) => [...prev, ...made]);
    },
    [setArmed],
  );

  // Paste from clipboard (files copied in a file manager / screenshot tools).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length) addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  // Share target (Feature 6): drain the service worker's IndexedDB inbox.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const files = await takeSharedFiles().catch(() => [] as File[]);
      if (!cancelled && files.length) {
        addFiles(files);
        setAnnounce(
          STRINGS[prefsRef.current.lang].sharedReceived.replace('{count}', String(files.length)),
        );
      }
      if (!cancelled && new URLSearchParams(window.location.search).has('shared')) {
        const params = new URLSearchParams(window.location.search);
        params.delete('shared');
        const qs = params.toString();
        window.history.replaceState(
          null,
          '',
          window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
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
        if (outputs.length === 0) throw new Error('EMPTY_RESULT');
        const named = renameOutputs(item, outputs, prefsRef.current.namePattern);
        patchItem(item.id, { status: 'done', progress: 1, outputs: named, note: undefined });
        setHistory(recordUse(item.category, item.target));
        setAnnounce(t.liveConverted.replace('{name}', item.file.name));
      } catch (e) {
        const raw = e instanceof Error ? e.message : '';
        const msg = explainError(raw, item, t);
        patchItem(item.id, { status: 'error', progress: 0, error: msg, note: undefined });
        setAnnounce(
          t.liveFailed.replace('{name}', item.file.name).replace('{error}', msg),
        );
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
          patchItem(item.id, { status: 'error', error: explainError('UNKNOWN_TYPE', item, t) });
          continue;
        }
        await convertItem(item);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, convertItem, patchItem, t]);

  const convertAllRef = useRef(convertAll);
  convertAllRef.current = convertAll;

  // Keyboard shortcut: Ctrl/Cmd+Enter converts everything (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) {
        return;
      }
      if (itemsRef.current.length > 0) {
        e.preventDefault();
        void convertAllRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    const out = await zipFiles(
      itemsRef.current.map((i) => i.file),
      bundleFileName('queued-files.zip', 'zip', prefsRef.current.namePattern),
    );
    setBundles((prev) => [...prev, out]);
  }, []);

  const mergePdfs = useCallback(async () => {
    const { mergePdfFiles } = await import('./lib/converters/pdf');
    const files = itemsRef.current.filter((i) => i.category === 'pdf').map((i) => i.file);
    const blob = await mergePdfFiles(files);
    setBundles((prev) => [
      ...prev,
      { name: bundleFileName('merged.pdf', 'pdf', prefsRef.current.namePattern), blob },
    ]);
  }, []);

  const combineImages = useCallback(async () => {
    const { imageToPdfBytes } = await import('./lib/converters/images');
    const { imagesToPdfBlob } = await import('./lib/converters/pdf');
    const parts = [];
    for (const it of itemsRef.current.filter((i) => i.category === 'image')) {
      parts.push(await imageToPdfBytes(it.file, adv));
    }
    const blob = await imagesToPdfBlob(parts);
    setBundles((prev) => [
      ...prev,
      { name: bundleFileName('images-combined.pdf', 'pdf', prefsRef.current.namePattern), blob },
    ]);
  }, [adv]);

  /* ----- quick convert (Feature 1) ----- */

  const quickList = useMemo(() => sortedHistory(history).slice(0, 6), [history]);

  const targetShort = useCallback(
    (category: Category, target: string) =>
      EXT_CHIP_TARGETS.has(target) ? target.toUpperCase() : targetLabel(t, category, target),
    [t],
  );

  const routeLabel = useCallback(
    (category: Category, target: string) =>
      `${t.category[category]} → ${targetShort(category, target)}`,
    [t, targetShort],
  );

  const applyQuick = useCallback(
    (entry: HistoryEntry) => {
      if (armedRef.current?.key === entry.key) {
        setArmed(null); // tapping the armed chip again disarms it
        return;
      }
      setItems((prev) =>
        prev.map((it) =>
          it.category === entry.category && (it.status === 'idle' || it.status === 'error')
            ? { ...it, target: entry.target, status: 'idle', outputs: [], error: undefined }
            : it,
        ),
      );
      setArmed({ key: entry.key, category: entry.category, target: entry.target });
    },
    [setArmed],
  );

  const clearQuick = useCallback(() => {
    const kept = clearHistory();
    setHistory(kept);
    if (armedRef.current && !kept.some((e) => e.key === armedRef.current?.key)) setArmed(null);
  }, [setArmed]);

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

  const presetLabel = (key: QualityPresetChoice) =>
    key === 'small'
      ? t.presetSmall
      : key === 'balanced'
        ? t.presetBalanced
        : key === 'best'
          ? t.presetBest
          : t.presetCustom;

  return (
    <div className="app">
      <div className="aurora" aria-hidden="true" />
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
          ref={dzRef}
          className={`dropzone${dragOver ? ' drag' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={t.dropTitle}
          onClick={() => fileInputRef.current?.click()}
          onPointerMove={onDzPointerMove}
          onPointerLeave={onDzPointerLeave}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => { e.preventDefault(); dragRef.current = true; setDragOver(true); }}
          onDragLeave={() => { dragRef.current = false; setDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            dragRef.current = false;
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

        {quickList.length > 0 && (
          <section className="card">
            <div className="quick-head">
              <h2>{t.quickTitle}</h2>
              <button type="button" className="text-btn" onClick={clearQuick}>
                {t.quickClear}
              </button>
            </div>
            <div className="quick-row">
              {quickList.map((entry) => {
                const label = routeLabel(entry.category, entry.target);
                const isArmed = armed?.key === entry.key;
                return (
                  <span key={entry.key} className={`quick-chip${isArmed ? ' armed' : ''}`}>
                    <button
                      type="button"
                      className="quick-main"
                      aria-pressed={isArmed}
                      onClick={() => applyQuick(entry)}
                    >
                      {label}
                    </button>
                    <button
                      type="button"
                      className="quick-star"
                      aria-pressed={entry.favourite}
                      aria-label={`${t.favourite}: ${label}`}
                      onClick={() => setHistory(toggleFavourite(entry.key))}
                    >
                      {entry.favourite ? '★' : '☆'}
                    </button>
                  </span>
                );
              })}
            </div>
            {armed && (
              <p className="quick-hint">
                {t.quickHintArmed
                  .replace('{cat}', t.category[armed.category])
                  .replace('{target}', targetShort(armed.category, armed.target))}
              </p>
            )}
          </section>
        )}

        <section className="card">
          <button type="button" className="adv-toggle" onClick={() => setAdvOpen((o) => !o)} aria-expanded={advOpen}>
            <span>{t.advanced}</span>
            <span className={`chev${advOpen ? ' open' : ''}`}>▾</span>
          </button>
          {advOpen && (
            <>
              <div className="adv-presets">
                <span className="adv-presets-label" id="quality-preset-label">{t.qualityPreset}</span>
                <div className="segmented" role="group" aria-labelledby="quality-preset-label">
                  {(['small', 'balanced', 'best', 'custom'] as QualityPresetChoice[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="seg-btn"
                      aria-pressed={prefs.qualityPreset === key}
                      onClick={() => {
                        if (key !== 'custom') {
                          setAdv((prev) => ({ ...prev, ...PRESET_VALUES[key as PresetKey] }));
                        }
                      }}
                    >
                      {presetLabel(key)}
                    </button>
                  ))}
                </div>
              </div>
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
                <label className="adv-wide">
                  {t.namePattern}
                  <input
                    type="text"
                    value={prefs.namePattern}
                    placeholder="{name}-converted"
                    onChange={(e) => setPrefs((p) => ({ ...p, namePattern: e.target.value }))}
                  />
                  <span className="adv-hint">{t.namePatternHint}</span>
                </label>
              </div>
            </>
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
            <div className="empty-state">
              <svg
                className="empty-art"
                viewBox="0 0 140 96"
                fill="none"
                aria-hidden="true"
                focusable="false"
              >
                <g className="fl-b">
                  <rect x="16" y="20" width="54" height="66" rx="9" className="art-card-back" />
                  <path d="M28 40h30M28 52h30M28 64h20" className="art-line-muted" strokeWidth="4" strokeLinecap="round" />
                </g>
                <g className="fl-a">
                  <rect x="70" y="14" width="54" height="66" rx="9" className="art-card-front" />
                  <path d="M82 34h30M82 46h30M82 58h20" className="art-line-accent" strokeWidth="4" strokeLinecap="round" />
                  <circle cx="112" cy="70" r="3.5" className="art-dot" />
                </g>
                <g className="fl-c">
                  <circle cx="70" cy="12" r="13" className="art-badge" />
                  <path
                    d="M64.5 9.5h6.5M68.8 6.3l3 3.2-3 3.2M75.5 15.5h-6.5M71.2 12.3l-3 3.2 3 3.2"
                    stroke="#fff"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              </svg>
              <p className="empty">{t.queueEmpty}</p>
            </div>
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
                          aria-label={`${item.file.name} — ${t.targetFormat}`}
                          onChange={(e) => {
                            const value = e.target.value;
                            patchItem(item.id, { target: value, status: 'idle', outputs: [], error: undefined });
                            setPrefs((p) => ({
                              ...p,
                              categoryTargets: { ...p.categoryTargets, [item.category]: value },
                            }));
                          }}
                        >
                          {targetsFor(item.category).map((tg) => (
                            <option key={tg} value={tg}>{targetLabel(t, item.category, tg)}</option>
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
                        <span className="status error">⚠ {item.error}</span>
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
                    <div
                      className="progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(item.progress * 100)}
                      aria-label={`${item.file.name} — ${t.converting}`}
                    >
                      <div className="bar" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                    </div>
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
              <button
                type="button"
                className="pill-btn danger"
                onClick={() => {
                  setItems([]);
                  setBundles([]);
                }}
              >
                {t.clearAll}
              </button>
              <span className="shortcut-hint">{t.shortcutHint}</span>
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

      <div className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
