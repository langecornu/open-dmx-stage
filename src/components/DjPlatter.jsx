// One deck's platter: a record that turns with the music (its angle comes from where the track is, so cueing or
// seeking moves it as a real record would) inside a ring of lights that runs round once a bar and flashes on the beat.
// Drawn on every frame by changing the page directly, so the console does not re-render sixty times a second.
import { useRef } from 'react';

import { useAnimationFrame } from '../hooks/useAnimationFrame.js';
import { beatAt, RPM } from '../utils/deckMaths.js';

const LEDS = 32;
const TRAIL = 6;
const RADIUS = 46;

/** The ring's lights, placed once. */
const LED_POINTS = Array.from({ length: LEDS }, (_, index) => {
  const angle = (index / LEDS) * Math.PI * 2 - Math.PI / 2;
  return { x: 50 + Math.cos(angle) * RADIUS, y: 50 + Math.sin(angle) * RADIUS };
});

const isReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * @param {{ side: 'A' | 'B', deck: import('../hooks/useDecks.js').DeckState, position: () => number,
 *   isCompact?: boolean }} props
 */
export function DjPlatter({ side, deck, position, isCompact = false }) {
  const recordRef = useRef(/** @type {SVGGElement | null} */ (null));
  const ringRef = useRef(/** @type {SVGGElement | null} */ (null));
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  useAnimationFrame(() => {
    const seconds = position();
    if (recordRef.current) {
      const angle = isReducedMotion() ? 0 : (seconds * RPM * 6) % 360;
      recordRef.current.setAttribute('transform', `rotate(${angle.toFixed(1)} 50 50)`);
    }
    const leds = ringRef.current?.children;
    if (!leds) {
      return;
    }
    const beat = deck.playing ? beatAt(deck.analysis, seconds) : null;
    const head = beat ? Math.floor(beat.bar * LEDS) : -1;
    for (let index = 0; index < leds.length; index += 1) {
      const behind = (head - index + LEDS) % LEDS;
      const level = head < 0 ? 0 : behind < TRAIL ? 1 - behind / TRAIL : 0;
      /** @type {SVGElement} */ (leds[index]).style.opacity = String(0.14 + level * 0.86);
    }
    rootRef.current?.toggleAttribute('data-beat', Boolean(beat && beat.phase < 0.12));
  });

  const title = deck.track?.title ?? '';
  return (
    <div
      ref={rootRef}
      className={`dj-platter dj-platter-${side.toLowerCase()}${isCompact ? ' dj-platter-compact' : ''}`}
      data-playing={deck.playing || undefined}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100">
        <g ref={ringRef} className="dj-ring">
          {LED_POINTS.map((point) => (
            <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r="1.5" />
          ))}
        </g>
        <circle className="dj-plate" cx="50" cy="50" r="42" />
        <g ref={recordRef}>
          <circle className="dj-vinyl" cx="50" cy="50" r="38" />
          {[34, 30, 26, 22].map((radius) => (
            <circle key={radius} className="dj-groove" cx="50" cy="50" r={radius} />
          ))}
          <path className="dj-shine" d="M50 12 A38 38 0 0 1 83 31 L50 50 Z" />
          <circle className="dj-label" cx="50" cy="50" r="13" />
          <text className="dj-label-text" x="50" y="48" textAnchor="middle">
            {side}
          </text>
          <text className="dj-label-sub" x="50" y="56" textAnchor="middle">
            {title.slice(0, 12)}
          </text>
          <circle className="dj-marker" cx="50" cy="16" r="1.6" />
        </g>
        <circle className="dj-spindle" cx="50" cy="50" r="1.8" />
      </svg>
    </div>
  );
}
