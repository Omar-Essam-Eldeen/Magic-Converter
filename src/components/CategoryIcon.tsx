/**
 * Original duotone category artwork (v1.3) — one small SVG per queue
 * category, drawn in the same visual language as the logo: a page/frame
 * base in muted slate (currentColor, themed by .cat-icon) carrying ONE
 * tangerine motif (the --accent variable via .ci-motif classes).
 * 24×24 viewBox, stroke-based, purely decorative (aria-hidden).
 */
import type { Category } from '../types';

/** Shared page outline + folded corner (pdf / data / text / unknown). */
function PageBase() {
  return (
    <>
      <path
        className="ci-base"
        d="M6.6 3.6h6.6l4 4v10.9a1.9 1.9 0 0 1-1.9 1.9H6.6a1.9 1.9 0 0 1-1.9-1.9V5.5a1.9 1.9 0 0 1 1.9-1.9Z"
      />
      <path className="ci-base" d="M13.2 3.6v4h4" />
    </>
  );
}

/** Shared picture-frame outline (image / video / audio). */
function FrameBase() {
  return <rect className="ci-base" x="3.6" y="3.6" width="16.8" height="16.8" rx="3.2" />;
}

function CategoryGlyph({ category }: { category: Category }) {
  switch (category) {
    case 'image':
      return (
        <>
          <FrameBase />
          <path className="ci-motif" d="M4.2 16.8 9.6 11.6l3.2 3 2.4-2.2 4.6 4.4" />
          <circle className="ci-motif-fill" cx="16.9" cy="7.4" r="1.3" />
        </>
      );
    case 'video':
      return (
        <>
          <FrameBase />
          <path className="ci-motif-fill" d="M10.2 8.7 15.8 12l-5.6 3.3Z" />
        </>
      );
    case 'audio':
      return (
        <>
          <FrameBase />
          <path className="ci-motif ci-motif-wave" d="M8 10v4M11 7.6v8.8M14 9.4v5.2M17 10.8v2.4" />
        </>
      );
    case 'pdf':
      return (
        <>
          <PageBase />
          <path className="ci-motif-fill" d="M7.6 6.8h3v7.4l-1.5-1.2-1.5 1.2Z" />
        </>
      );
    case 'data':
      return (
        <>
          <PageBase />
          <rect className="ci-motif-fill" x="7.4" y="10.6" width="7" height="3.4" />
          <path className="ci-base ci-grid" d="M7.4 10.6h7v7h-7Z M7.4 14h7 M10.9 10.6v7" />
        </>
      );
    case 'text':
      return (
        <>
          <PageBase />
          <path className="ci-base" d="M6.9 10.2h4.4M6.9 13.4h4.4M6.9 16.6h3.2" />
          {/* abstract pilcrow flourish — no letters, just the gesture */}
          <path className="ci-motif" d="M16.9 16.4V9.2M15 16.4V9.2M15 9.4a2.35 2.35 0 1 1-.04 3.6" />
        </>
      );
    case 'archive':
      return (
        <>
          <path
            className="ci-base"
            d="M6.3 4.5h11.4a1.7 1.7 0 0 1 1.7 1.7v11.6a1.9 1.9 0 0 1-1.9 1.9h-11a1.9 1.9 0 0 1-1.9-1.9V6.2a1.7 1.7 0 0 1 1.7-1.7Z"
          />
          <path className="ci-base" d="M4.6 8.6h14.8" />
          <path className="ci-motif ci-motif-wave" d="M12 8.6v1.5M12 11.6v1.5M12 14.6v1.2" />
          <rect className="ci-motif" x="10.9" y="16.4" width="2.2" height="2.6" rx="1" />
        </>
      );
    case 'unknown':
    default:
      return (
        <>
          <PageBase />
          <path className="ci-motif ci-motif-wave" d="M9.7 9.3a2.65 2.65 0 1 1 3.6 2.25c-.85.33-1.3.85-1.3 1.75" />
          <circle className="ci-motif-fill" cx="12" cy="16.4" r="1.05" />
        </>
      );
  }
}

interface CategoryIconProps {
  category: Category;
  size?: number;
}

export default function CategoryIcon({ category, size = 22 }: CategoryIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className="cat-icon"
      aria-hidden="true"
      focusable="false"
    >
      <CategoryGlyph category={category} />
    </svg>
  );
}
