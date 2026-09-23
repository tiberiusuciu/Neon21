/** Flat wireframe Ace of Spades — mirrors `WireAceCard` silhouette. */

const SPADE =
  "M0 0.95 C0.18 0.55 0.82 0.38 0.82 -0.02 C0.82 -0.32 0.38 -0.42 0.14 -0.32 L0.32 -0.92 L0 -0.68 L-0.32 -0.92 L-0.14 -0.32 C-0.38 -0.42 -0.82 -0.32 -0.82 -0.02 C-0.82 0.38 -0.18 0.55 0 0.95 Z";

type Props = {
  className?: string;
  color?: string;
};

export function WireAceSvg({ className, color = "currentColor" }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 44 62"
      width="44"
      height="62"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="1.5"
        y="1.5"
        width="41"
        height="59"
        rx="2.8"
        stroke={color}
        strokeWidth="1.35"
      />
      <g transform="translate(22 31) scale(13.2 -13.2)">
        <path d={SPADE} stroke={color} strokeWidth="0.07" />
      </g>
      <g transform="translate(8.2 9.2) scale(9.5 -9.5)">
        <path
          d="M-0.18 -0.28 L0 0.28 L0.18 -0.28 M0.1 -0.04 L-0.1 -0.04"
          stroke={color}
          strokeWidth="0.09"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g transform="translate(8.2 16.8) scale(2.9 -2.9)">
        <path d={SPADE} stroke={color} strokeWidth="0.12" />
      </g>
      <g transform="translate(35.8 52.8) scale(-9.5 9.5)">
        <path
          d="M-0.18 -0.28 L0 0.28 L0.18 -0.28 M0.1 -0.04 L-0.1 -0.04"
          stroke={color}
          strokeWidth="0.09"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <g transform="translate(35.8 45.2) scale(-2.9 2.9)">
        <path d={SPADE} stroke={color} strokeWidth="0.12" />
      </g>
    </svg>
  );
}

/** Tiny white wire ace for CSS `background-image` tiling in the jackpot liquid. */
export const WIRE_ACE_TILE_URL =
  "url(\"data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 62" width="44" height="62" fill="none">` +
      `<rect x="2" y="2" width="40" height="58" rx="3" stroke="#fffef6" stroke-width="2.2" opacity="0.75"/>` +
      `<g transform="translate(22 31) scale(12.5 -12.5)">` +
      `<path d="${SPADE}" stroke="#fffef6" stroke-width="0.12" opacity="0.7"/>` +
      `</g>` +
      `<g transform="translate(8.4 9.5) scale(9 -9)">` +
      `<path d="M-0.18 -0.28 L0 0.28 L0.18 -0.28 M0.1 -0.04 L-0.1 -0.04" stroke="#fffef6" stroke-width="0.14" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>` +
      `</g>` +
      `<g transform="translate(8.4 16.5) scale(2.8 -2.8)">` +
      `<path d="${SPADE}" stroke="#fffef6" stroke-width="0.2" opacity="0.7"/>` +
      `</g>` +
      `<g transform="translate(35.6 52.5) scale(-9 9)">` +
      `<path d="M-0.18 -0.28 L0 0.28 L0.18 -0.28 M0.1 -0.04 L-0.1 -0.04" stroke="#fffef6" stroke-width="0.14" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>` +
      `</g>` +
      `<g transform="translate(35.6 45.5) scale(-2.8 2.8)">` +
      `<path d="${SPADE}" stroke="#fffef6" stroke-width="0.2" opacity="0.7"/>` +
      `</g>` +
      `</svg>`
  ) +
  "\")";
