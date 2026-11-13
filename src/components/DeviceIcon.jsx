// A small pictogram of each kind of device (par, moving head, smoke machine…), shown beside a light's name wherever it
// appears. Each is an original drawing in the style of stage-lighting pictograms: a bold silhouette in the text colour
// (black in the light theme, white in the dark one), with details cut out of it, and colour only where light comes out
// (LEDs, lenses, beams), in the light's own colour (`glow`, for example what it is sending now) or the category's.
// It is decorative: the name beside it says the same, so screen readers skip it; a tooltip names the category.
import { useId } from 'react';

import { CATEGORY_INFO } from '../../shared/categories.js';

/** The colour each kind of device lights up in when no colour is given. */
export const CATEGORY_GLOW = {
  par: '#a855f7',
  spot: '#fbbf24',
  'moving-head': '#38bdf8',
  scanner: '#34d399',
  'barrel-scanner': '#f472b6',
  'led-bar': '#22d3ee',
  matrix: '#f59e0b',
  strobe: '#7dd3fc',
  blinder: '#fbbf24',
  spider: '#e879f9',
  effect: '#f43f5e',
  flower: '#a3e635',
  'mirror-ball': '#38bdf8',
  laser: '#22c55e',
  smoke: '#94a3b8',
  hazer: '#94a3b8',
  fan: '#38bdf8',
  'special-effect': '#fbbf24',
  dimmer: '#fb923c',
  other: '#60a5fa',
};

const range = (count) => Array.from({ length: count }, (_, index) => index);

/**
 * Each drawing has a `body`, drawn into a mask (white shows the silhouette, black cuts a detail out of it), and `light`,
 * drawn on top in colour: `c` is the light colour and `beam` the id of a gradient that fades it out. On a 48 by 48 grid.
 * @type {Record<string, { body: () => import('react').ReactNode, light: (c: string, beam: string) => import('react').ReactNode }>}
 */
const DRAWINGS = {
  par: {
    body: () => (
      <>
        <path d="M8 25V14a3 3 0 0 1 6 0v11M40 25V14a3 3 0 0 0-6 0v11" fill="none" stroke="white" strokeWidth="3.4" />
        <rect x="18" y="38" width="12" height="6" rx="1.5" fill="white" />
        <path d="M24 38v-3" stroke="white" strokeWidth="3" />
        <circle cx="24" cy="21" r="15" fill="white" />
        <circle cx="24" cy="21" r="11.2" fill="black" />
      </>
    ),
    light: (c) =>
      [
        [24, 21],
        ...range(6).map((i) => [24 + 5.2 * Math.cos((Math.PI / 3) * i), 21 + 5.2 * Math.sin((Math.PI / 3) * i)]),
        ...range(6).map((i) => [
          24 + 9.2 * Math.cos((Math.PI / 3) * i + Math.PI / 6),
          21 + 9.2 * Math.sin((Math.PI / 3) * i + Math.PI / 6),
        ]),
      ].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.9" fill={c} />),
  },
  spot: {
    body: () => (
      <>
        <path d="M6 15h20l4-3v20l-4-3H6z" fill="white" />
        <rect x="29" y="16" width="7" height="12" rx="1" fill="white" />
        <path d="M36 14h5v16h-5z" fill="white" />
        <path d="M10 19h12M10 22h12M10 25h12" stroke="black" strokeWidth="1.2" />
        <path d="M17 29v8M17 37l-8 7M17 37l8 7M17 37v7" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      </>
    ),
    light: (c, beam) => <path d="M41 16 48 11v22l-7-5z" fill={`url(#${beam})`} />,
  },
  'moving-head': {
    body: () => (
      <>
        <rect x="9" y="36" width="30" height="9" rx="2" fill="white" />
        <rect x="13" y="38.5" width="10" height="4" rx="1" fill="black" />
        <path d="M14 36V20a4 4 0 0 1 4-4M34 36V20a4 4 0 0 0-4-4" fill="none" stroke="white" strokeWidth="4" />
        <rect x="15" y="5" width="18" height="25" rx="7" fill="white" transform="rotate(-18 24 17)" />
        <circle cx="21.5" cy="12" r="5.6" fill="black" />
      </>
    ),
    light: (c) => (
      <>
        <circle cx="21.5" cy="12" r="3.8" fill={c} />
        <rect x="14" y="39.5" width="8" height="2" rx=".6" fill={c} />
        <circle cx="33" cy="40.5" r="1.2" fill={c} />
      </>
    ),
  },
  scanner: {
    body: () => (
      <>
        <rect x="3" y="18" width="27" height="13" rx="2.5" fill="white" />
        <path d="M7 22h14M7 26h14" stroke="black" strokeWidth="1.4" />
        <path d="m30 21 7-6 3 3.5-7 6z" fill="white" />
        <path d="M8 31v6M25 31v6M5 37h23" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      </>
    ),
    light: (c, beam) => <path d="M37 18 48 6v14z" fill={`url(#${beam})`} />,
  },
  'barrel-scanner': {
    body: () => (
      <>
        <rect x="7" y="35" width="34" height="9" rx="2" fill="white" />
        <path d="M11 35V24M37 35V24" stroke="white" strokeWidth="3.4" strokeLinecap="round" />
        <rect x="9" y="11" width="30" height="16" rx="8" fill="white" />
        {[14, 20, 26, 32].map((x) => (
          <rect key={x} x={x} y="14.5" width="3.4" height="9" rx="1.7" fill="black" />
        ))}
      </>
    ),
    light: (c) =>
      [14, 20, 26, 32].map((x) => <rect key={x} x={x + 0.6} y="15.5" width="2.2" height="7" rx="1.1" fill={c} />),
  },
  'led-bar': {
    body: () => (
      <>
        <path d="M6 31v-7M42 31v-7" stroke="white" strokeWidth="2.6" />
        <path d="M4 31h40" stroke="white" strokeWidth="3" strokeLinecap="round" />
        <rect x="2" y="14" width="44" height="12" rx="2" fill="white" />
        {range(8).map((i) => (
          <circle key={i} cx={6.5 + i * 5} cy="20" r="2" fill="black" />
        ))}
      </>
    ),
    light: (c) => range(8).map((i) => <circle key={i} cx={6.5 + i * 5} cy="20" r="1.5" fill={c} />),
  },
  matrix: {
    body: () => (
      <>
        <path d="M4 22a4 4 0 0 1 4-4M44 22a4 4 0 0 0-4-4" fill="none" stroke="white" strokeWidth="2.6" />
        <rect x="8" y="4" width="32" height="34" rx="2.5" fill="white" />
        {range(6).flatMap((row) =>
          range(6).map((column) => (
            <circle key={`${row}-${column}`} cx={12 + column * 4.8} cy={9 + row * 5} r="1.7" fill="black" />
          )),
        )}
        <rect x="18" y="40" width="12" height="5" rx="1" fill="white" />
      </>
    ),
    light: (c) =>
      range(6).flatMap((row) =>
        range(6).map((column) =>
          (row + column) % 2 === 0 ? (
            <circle key={`${row}-${column}`} cx={12 + column * 4.8} cy={9 + row * 5} r="1.3" fill={c} />
          ) : null,
        ),
      ),
  },
  strobe: {
    body: () => (
      <>
        <rect x="5" y="14" width="38" height="18" rx="2.5" fill="white" />
        <rect x="9" y="18" width="30" height="10" rx="1.5" fill="black" />
        <path d="M12 32v6M36 32v6M9 38h30" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      </>
    ),
    light: (c) => (
      <>
        <rect x="10" y="19" width="28" height="8" rx="1" fill={c} />
        <path d="M24 4v6M14 6l3 5M34 6l-3 5" stroke={c} strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  blinder: {
    body: () => (
      <>
        <path d="M2 25V12a3 3 0 0 1 3-3M46 25V12a3 3 0 0 0-3-3" fill="none" stroke="white" strokeWidth="2.6" />
        <rect x="6" y="6" width="36" height="30" rx="2.5" fill="white" />
        {range(2).flatMap((row) =>
          range(4).map((column) => (
            <circle key={`${row}-${column}`} cx={12 + column * 8} cy={14 + row * 14} r="3.4" fill="black" />
          )),
        )}
        <rect x="18" y="38" width="12" height="6" rx="1" fill="white" />
      </>
    ),
    light: (c) =>
      range(2).flatMap((row) =>
        range(4).map((column) => (
          <circle key={`${row}-${column}`} cx={12 + column * 8} cy={14 + row * 14} r="2.5" fill={c} />
        )),
      ),
  },
  spider: {
    body: () => (
      <>
        <rect x="9" y="36" width="30" height="8" rx="2" fill="white" />
        <path d="M14 36v-5M34 36v-5" stroke="white" strokeWidth="2.6" />
        <rect x="3" y="24" width="20" height="7" rx="2" fill="white" transform="rotate(-14 13 27.5)" />
        <rect x="25" y="24" width="20" height="7" rx="2" fill="white" transform="rotate(14 35 27.5)" />
        {range(4).map((i) => (
          <circle key={`a${i}`} cx={6.5 + i * 4.6} cy="27.5" r="1.7" fill="black" transform="rotate(-14 13 27.5)" />
        ))}
        {range(4).map((i) => (
          <circle key={`b${i}`} cx={28.5 + i * 4.6} cy="27.5" r="1.7" fill="black" transform="rotate(14 35 27.5)" />
        ))}
      </>
    ),
    light: (c, beam) => (
      <>
        <path d="M8 26 0 4h6zM18 24 14 2h6zM30 24 28 2h6zM40 26 42 4h6z" fill={`url(#${beam})`} />
        {range(4).map((i) => (
          <circle key={`a${i}`} cx={6.5 + i * 4.6} cy="27.5" r="1.2" fill={c} transform="rotate(-14 13 27.5)" />
        ))}
        {range(4).map((i) => (
          <circle key={`b${i}`} cx={28.5 + i * 4.6} cy="27.5" r="1.2" fill={c} transform="rotate(14 35 27.5)" />
        ))}
      </>
    ),
  },
  effect: {
    body: () => (
      <>
        <path d="M7 34a17 17 0 0 1 34 0z" fill="white" />
        {[
          [16, 29],
          [21.5, 25.5],
          [26.5, 25.5],
          [32, 29],
          [24, 31],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2.1" fill="black" />
        ))}
        <rect x="4" y="34" width="40" height="8" rx="2" fill="white" />
      </>
    ),
    light: (c, beam) => (
      <>
        <path d="M21.5 25.5 6 3h7zM26.5 25.5 35 2h7zM32 29 48 14v7z" fill={`url(#${beam})`} />
        {[
          [16, 29],
          [21.5, 25.5],
          [26.5, 25.5],
          [32, 29],
          [24, 31],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill={c} />
        ))}
      </>
    ),
  },
  flower: {
    body: () => (
      <>
        <path d="M9 38a15 15 0 0 1 30 0z" fill="white" />
        <circle cx="24" cy="33" r="3.6" fill="black" />
        <rect x="6" y="38" width="36" height="7" rx="2" fill="white" />
      </>
    ),
    light: (c, beam) => (
      <>
        {[-62, -38, -14, 14, 38, 62].map((angle) => (
          <path key={angle} d="M24 31 21.6 3h4.8z" transform={`rotate(${angle} 24 31)`} fill={`url(#${beam})`} />
        ))}
        <circle cx="24" cy="33" r="2.4" fill={c} />
      </>
    ),
  },
  'mirror-ball': {
    body: () => (
      <>
        <path d="M24 2v9" stroke="white" strokeWidth="2" />
        <circle cx="24" cy="27" r="16" fill="white" />
        <g stroke="black" strokeWidth="1.1" fill="none">
          <path d="M8.5 27h31M10 20h28M10 34h28M14 14h20M14 40h20" />
          <path d="M24 11v32M17 13c-4.5 8-4.5 20 0 28M31 13c4.5 8 4.5 20 0 28" />
        </g>
      </>
    ),
    light: (c) => (
      <>
        <path d="M15 18.5l2 2-2 2-2-2zM33 30l1.6 1.6L33 33.2l-1.6-1.6z" fill={c} />
        <path d="M4 8l4 3M44 8l-4 3M3 30h4M45 30h-4" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  laser: {
    body: () => (
      <>
        <path d="M3 30 9 22h14l-6 8z" fill="white" />
        <rect x="3" y="30" width="14" height="12" rx="1.5" fill="white" />
        <path d="M17 42V30l6-8v12z" fill="white" />
        <circle cx="10" cy="36" r="2.4" fill="black" />
      </>
    ),
    light: (c, beam) => (
      <>
        {[
          [46, 4],
          [47, 10],
          [47, 16],
          [46, 22],
          [44, 28],
          [40, 33],
        ].map(([x, y]) => (
          <path key={`${x}-${y}`} d={`M20 27 ${x} ${y}`} stroke={`url(#${beam})`} strokeWidth="1.3" />
        ))}
        <circle cx="10" cy="36" r="1.4" fill={c} />
      </>
    ),
  },
  smoke: {
    body: () => (
      <>
        <rect x="2" y="25" width="28" height="17" rx="2.5" fill="white" />
        {[6, 10, 14, 18].map((x) => (
          <path key={x} d={`M${x} 29v9`} stroke="black" strokeWidth="1.6" strokeLinecap="round" />
        ))}
        <rect x="29" y="29" width="6" height="5" rx="1" fill="white" />
        <circle cx="25" cy="33" r="2.2" fill="black" />
      </>
    ),
    light: (c) => (
      <>
        <path d="M34 28c-3-4 0-9 5-8 1-5 9-5 9 1 0 3-2 5-5 5h-7c-1 0-2 1-2 2z" fill={c} fillOpacity=".85" />
        <path d="M38 15a3 3 0 0 1 5-2" stroke={c} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="25" cy="33" r="1.2" fill={c} />
      </>
    ),
  },
  hazer: {
    body: () => (
      <>
        <rect x="2" y="17" width="24" height="25" rx="2.5" fill="white" />
        <circle cx="14" cy="29.5" r="8.4" fill="black" />
        <circle cx="14" cy="29.5" r="1.8" fill="white" />
        <path d="M14 29.5V23M14 29.5l6 3.2M14 29.5l-6 3.2" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      </>
    ),
    light: (c) => (
      <path
        d="M27 15c5-4 9 3 14-1 3-2 5 0 7-1M27 22c5-4 9 3 14-1 3-2 5 0 7-1M27 29c5-4 9 3 14-1 3-2 5 0 7-1"
        stroke={c}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
    ),
  },
  fan: {
    body: () => (
      <>
        <circle cx="24" cy="21" r="17" fill="white" />
        <circle cx="24" cy="21" r="14" fill="black" />
        {[0, 120, 240].map((angle) => (
          <path
            key={angle}
            d="M24 21c-2.5-6 0-11.5 5.5-12.5 3.2 1.2 2 6.5-5.5 12.5z"
            transform={`rotate(${angle} 24 21)`}
            fill="white"
          />
        ))}
        <circle cx="24" cy="21" r="2.6" fill="white" />
        <path d="M17 37l-3 7h20l-3-7z" fill="white" />
      </>
    ),
    light: (c) => (
      <path
        d="M44 14c2 4 2 10 0 14M4 14c-2 4-2 10 0 14"
        stroke={c}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    ),
  },
  'special-effect': {
    body: () => (
      <>
        <path d="M13 32h22l3 12H10z" fill="white" />
        <rect x="18" y="28" width="12" height="5" rx="1.2" fill="white" />
        <circle cx="24" cy="38" r="2" fill="black" />
      </>
    ),
    light: (c, beam) => (
      <>
        {[
          [24, 3],
          [15, 7],
          [33, 7],
          [10, 15],
          [38, 15],
          [19, 15],
          [29, 15],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <path d={`M24 27 ${x} ${y}`} stroke={`url(#${beam})`} strokeWidth="1.1" />
            <circle cx={x} cy={y} r="1.3" fill={c} />
          </g>
        ))}
        <circle cx="24" cy="38" r="1.1" fill={c} />
      </>
    ),
  },
  dimmer: {
    body: () => (
      <>
        <path
          d="M24 3a12 12 0 0 0-7.2 21.6c1.5 1.1 2.4 2.8 2.4 4.6h9.6c0-1.8.9-3.5 2.4-4.6A12 12 0 0 0 24 3z"
          fill="white"
        />
        <path
          d="M24 6.2a8.8 8.8 0 0 0-5.3 15.8c2 1.5 3 3.4 3.3 5.2h4c.3-1.8 1.3-3.7 3.3-5.2A8.8 8.8 0 0 0 24 6.2z"
          fill="black"
        />
        <rect x="18.5" y="30.5" width="11" height="10" rx="1.6" fill="white" />
        <path d="M18.5 34h11M18.5 37.4h11" stroke="black" strokeWidth="1" />
        <path d="M21 40.5h6l-1.4 3.5h-3.2z" fill="white" />
      </>
    ),
    light: (c) => (
      <path
        d="M24 6.2a8.8 8.8 0 0 0-5.3 15.8c2 1.5 3 3.4 3.3 5.2h4c.3-1.8 1.3-3.7 3.3-5.2A8.8 8.8 0 0 0 24 6.2z"
        fill={c}
      />
    ),
  },
  other: {
    body: () => (
      <>
        <rect x="3" y="13" width="42" height="22" rx="2.5" fill="white" />
        <rect x="7" y="17" width="15" height="7" rx="1" fill="black" />
        <circle cx="30" cy="20.5" r="3.4" fill="black" />
        {[10, 17, 24].map((x) => (
          <circle key={x} cx={x} cy="30" r="2.4" fill="black" />
        ))}
        <path d="M8 35v4M40 35v4" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      </>
    ),
    light: (c) => (
      <>
        <path d="M9 20.5h11" stroke={c} strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="39" cy="20.5" r="1.6" fill={c} />
      </>
    ),
  },
};

/**
 * @param {{ category: string, size?: number, glow?: string, className?: string }} props `glow` is a CSS colour for its
 *   LEDs and beams, such as what the light is sending now; it falls back to the category's colour
 */
export function DeviceIcon({ category, size = 24, glow, className = '' }) {
  const key = DRAWINGS[category] ? category : 'other';
  const id = useId().replace(/:/g, '');
  const colour = glow || CATEGORY_GLOW[key];
  const drawing = DRAWINGS[key];
  return (
    <svg
      className={`device-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      data-category={key}
    >
      <title>{CATEGORY_INFO[key].label}</title>
      <defs>
        <mask id={`${id}-cut`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="black" />
          {drawing.body()}
        </mask>
        <linearGradient id={`${id}-beam`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={colour} stopOpacity=".95" />
          <stop offset="1" stopColor={colour} stopOpacity=".15" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" fill="currentColor" mask={`url(#${id}-cut)`} />
      {drawing.light(colour, `${id}-beam`)}
    </svg>
  );
}
