import { baseName, extOf, outputExtFor } from './detect';

export interface NamePatternContext {
  /** the queue item's target key, e.g. 'jpg' | 'images' | 'split' */
  target: string;
  /** 1-based index within the item's outputs */
  index: number;
}

/**
 * Apply an output name pattern. Supported tokens:
 *   {name}   original base name without extension
 *   {ext}    original extension (no dot)
 *   {target} output extension for the route (e.g. images → png, split → pdf)
 *   {date}   today as YYYYMMDD
 *   {n}      1-based index within the item's outputs
 * An empty pattern returns the original name unchanged.
 */
export function applyNamePattern(
  originalName: string,
  pattern: string,
  ctx: NamePatternContext,
): string {
  if (!pattern) return originalName;
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return pattern
    .replaceAll('{name}', baseName(originalName))
    .replaceAll('{ext}', extOf(originalName))
    .replaceAll('{target}', outputExtFor(ctx.target))
    .replaceAll('{date}', date)
    .replaceAll('{n}', String(ctx.index));
}
