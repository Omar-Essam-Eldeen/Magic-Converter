import type { Strings } from '../i18n';
import type { QueueItem } from '../types';
import { extOf } from './detect';

/** Files above this size failing in the image/PDF paths get size advice. */
const TOO_BIG_BYTES = 200 * 1024 * 1024;

/**
 * Turn a raw converter error into a plain-language sentence:
 * what happened + what to try. All wording comes from i18n so both
 * languages read naturally.
 */
export function explainError(rawMessage: string, item: QueueItem, t: Strings): string {
  const raw = rawMessage || '';
  if (raw === 'SPLIT_RANGE_MISSING') return t.errSplitRange;
  if (raw === 'PDF_PASSWORD' || /password/i.test(raw)) return t.errPdfPassword;
  if (raw === 'UNSUPPORTED') return t.errUnsupportedFull;
  if (raw === 'UNKNOWN_TYPE') return t.errUnknownTypeFull;
  if (raw === 'EMPTY_RESULT') return t.errEmptyResult;
  if (
    item.file.size > TOO_BIG_BYTES &&
    (item.category === 'image' || item.category === 'pdf')
  ) {
    return t.errTooBig;
  }
  if (item.category === 'video' || item.category === 'audio') return t.errFfmpegFull;
  if (item.category === 'image' && ['heic', 'heif'].includes(extOf(item.file.name))) {
    return t.errHeicFull;
  }
  return t.errGenericFull;
}
