import type { Category } from '../types';

/**
 * Recent & favourite conversion routes ("Quick convert").
 * Stored in localStorage under `converter-app:history:v1`. One entry per
 * route, keyed `${category}:${target}`; counts and last-used drive sorting,
 * favourites pin to the front.
 */
export interface HistoryEntry {
  key: string;
  category: Category;
  target: string;
  count: number;
  lastUsed: number;
  favourite: boolean;
}

const HISTORY_KEY = 'converter-app:history:v1';

const CATEGORIES: Category[] = [
  'image',
  'video',
  'audio',
  'pdf',
  'data',
  'text',
  'archive',
  'unknown',
];

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: HistoryEntry[] = [];
    for (const e of parsed as Record<string, unknown>[]) {
      if (!e || typeof e !== 'object') continue;
      const category = e.category as Category;
      const target = e.target;
      if (!CATEGORIES.includes(category) || typeof target !== 'string' || !target) continue;
      out.push({
        key: typeof e.key === 'string' ? e.key : `${category}:${target}`,
        category,
        target,
        count: typeof e.count === 'number' && e.count > 0 ? e.count : 1,
        lastUsed: typeof e.lastUsed === 'number' ? e.lastUsed : 0,
        favourite: e.favourite === true,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function saveHistory(list: HistoryEntry[]): HistoryEntry[] {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — history is a convenience only */
  }
  return list;
}

/** Record one successful conversion of category → target. */
export function recordUse(category: Category, target: string): HistoryEntry[] {
  const list = loadHistory();
  const key = `${category}:${target}`;
  const now = Date.now();
  const existing = list.find((e) => e.key === key);
  if (existing) {
    existing.count += 1;
    existing.lastUsed = now;
  } else {
    list.push({ key, category, target, count: 1, lastUsed: now, favourite: false });
  }
  return saveHistory(list);
}

export function toggleFavourite(key: string): HistoryEntry[] {
  const list = loadHistory();
  const entry = list.find((e) => e.key === key);
  if (entry) entry.favourite = !entry.favourite;
  return saveHistory(list);
}

/** Clear all non-favourite history; favourites are kept. */
export function clearHistory(): HistoryEntry[] {
  return saveHistory(loadHistory().filter((e) => e.favourite));
}

/** Favourites first, then most-used, then most recent. */
export function sortedHistory(list: HistoryEntry[]): HistoryEntry[] {
  return [...list].sort(
    (a, b) =>
      Number(b.favourite) - Number(a.favourite) || b.count - a.count || b.lastUsed - a.lastUsed,
  );
}
