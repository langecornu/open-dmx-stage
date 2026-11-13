// A deck's waveform: the track's loudness outline with what has played lit up, the cue point, and a slider over it to
// move through the track (a real slider, so it works from the keyboard and with a screen reader).
import { useRef } from 'react';

import { useAnimationFrame } from '../hooks/useAnimationFrame.js';
import { formatTime } from '../utils/deckMaths.js';

/**
 * The outline as one SVG path, mirrored about the middle.
 * @param {number[]} peaks 0 to 1
 * @returns {string}
 */
function outlinePath(peaks) {
  if (peaks.length === 0) {
    return '';
  }
  const step = 100 / peaks.length;
  const top = peaks.map((peak, index) => `${(index * step).toFixed(2)},${(50 - peak * 46).toFixed(1)}`);
  const bottom = peaks.map((peak, index) => `${(index * step).toFixed(2)},${(50 + peak * 46).toFixed(1)}`).reverse();
  return `M0,50 L${top.join(' L')} L100,50 L${bottom.join(' L')} Z`;
}

/**
 * @param {{ side: 'A' | 'B', deck: import('../hooks/useDecks.js').DeckState, position: () => number,
 *   duration: number, onSeek: (seconds: number) => void }} props
 */
export function DjWaveform({ side, deck, position, duration, onSeek }) {
  const playedRef = useRef(/** @type {SVGRectElement | null} */ (null));
  const sliderRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const timeRef = useRef(/** @type {HTMLSpanElement | null} */ (null));
  const isDragging = useRef(false);

  useAnimationFrame(() => {
    const seconds = position();
    const share = duration > 0 ? Math.min(1, seconds / duration) : 0;
    playedRef.current?.setAttribute('width', String(share * 100));
    if (sliderRef.current && !isDragging.current) {
      sliderRef.current.value = String(Math.round(seconds * 10) / 10);
    }
    if (timeRef.current) {
      timeRef.current.textContent = `${formatTime(seconds)} / -${formatTime(duration - seconds)}`;
    }
  });

  const path = outlinePath(deck.analysis?.peaks ?? []);
  const clipId = `dj-played-${side}`;
  return (
    <div className="dj-wave">
      <svg className="dj-wave-art" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <rect ref={playedRef} x="0" y="0" width="0" height="100" />
          </clipPath>
        </defs>
        {path ? (
          <>
            <path className="dj-wave-rest" d={path} />
            <path className="dj-wave-played" d={path} clipPath={`url(#${clipId})`} />
          </>
        ) : (
          <line className="dj-wave-rest" x1="0" y1="50" x2="100" y2="50" />
        )}
        {duration > 0 ? (
          <line
            className="dj-wave-cue"
            x1={(deck.cue / duration) * 100}
            y1="0"
            x2={(deck.cue / duration) * 100}
            y2="100"
          />
        ) : null}
      </svg>
      <input
        ref={sliderRef}
        className="dj-wave-slider"
        type="range"
        min="0"
        max={Math.max(1, duration)}
        step="0.1"
        defaultValue="0"
        disabled={!deck.track}
        aria-label={`Position on deck ${side}`}
        onPointerDown={() => {
          isDragging.current = true;
        }}
        onPointerUp={() => {
          isDragging.current = false;
        }}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
      <span ref={timeRef} className="dj-time">
        0:00
      </span>
    </div>
  );
}
