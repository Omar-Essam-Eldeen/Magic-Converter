/**
 * The Converter — Tangerine brand mark (v1.3, original artwork).
 *
 * Concept: two overlapping pages in dark ink on a tangerine-gradient
 * squircle tile. The front page's folded corner sweeps out into a bold
 * rightward arrowhead (the conversion), and a shorter return arc beneath
 * the pages answers it — conversion runs both ways. The front page wears
 * a thin gradient "halo" so it lifts off the back page at any size, and
 * the shapes are bold enough to stay legible down to 24px and to survive
 * as a single-colour silhouette.
 *
 * `LogoGlyph` renders the mark's inner shapes (defs included) so the mark
 * can also be nested inside another SVG (e.g. the empty-state artwork);
 * `Logo` is the standalone inline component. The master vector lives at
 * public/logo.svg — keep the two in sync.
 */

export function LogoGlyph() {
  return (
    <>
      <defs>
        <linearGradient id="tg-logo" gradientUnits="userSpaceOnUse" x1="10" y1="4" x2="56" y2="62">
          <stop offset="0" stopColor="#E85D04" />
          <stop offset="0.52" stopColor="#F2760A" />
          <stop offset="1" stopColor="#FFB25E" />
        </linearGradient>
        <clipPath id="tg-tile-clip">
          <rect x="3" y="3" width="58" height="58" rx="16" />
        </clipPath>
      </defs>
      {/* squircle tile */}
      <rect x="3" y="3" width="58" height="58" rx="16" fill="url(#tg-logo)" />
      <g clipPath="url(#tg-tile-clip)">
        {/* soft top sheen, clipped to the tile */}
        <ellipse cx="32" cy="6" rx="26" ry="10" fill="#FFFFFF" opacity="0.10" />
      </g>
      {/* back page (dark ink, plain — the front page carries the fold) */}
      <rect x="16" y="9.5" width="25" height="30" rx="4.5" fill="#14100C" />
      {/* front page (dark ink; a gradient halo lifts it off the back page) */}
      <path
        d="M27 19.5h9.8l7.2 7.2V44a4.2 4.2 0 0 1-4.2 4.2H26.6a4.2 4.2 0 0 1-4.2-4.2V23.7a4.2 4.2 0 0 1 4.6-4.2Z"
        fill="#14100C"
        stroke="url(#tg-logo)"
        strokeWidth="2.4"
      />
      {/* folded corner flap, in tile colours */}
      <path d="M36.8 19.5h7.2v7.2Z" fill="url(#tg-logo)" />
      {/* the fold sweeps out into a bold rightward arrowhead (merged silhouette) */}
      <path d="M41 28.4 57.5 36.2 41 44Z" fill="#14100C" />
      {/* return arc: the way back (two-way conversion) */}
      <path
        d="M46.5 48.5c-3.8 5.6-12.4 8-20.5 6.2"
        fill="none"
        stroke="#14100C"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path d="M17.2 53.6l9.6-2.7-1.2 7.7Z" fill="#14100C" />
    </>
  );
}

interface LogoProps {
  /** Rendered width/height in px. */
  size?: number;
  /** Decorative marks are hidden from AT (the wordmark sits beside them). */
  decorative?: boolean;
  className?: string;
}

export default function Logo({ size = 42, decorative = true, className }: LogoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      {...(decorative
        ? { 'aria-hidden': true, focusable: false }
        : { role: 'img', 'aria-label': 'Converter — Tangerine' })}
    >
      {!decorative && <title>Converter — Tangerine</title>}
      <LogoGlyph />
    </svg>
  );
}
