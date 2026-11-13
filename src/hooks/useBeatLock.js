// Locks the lights to the decks: while a deck is heard (playing, and the loudest through its volume and the
// crossfader), the engine's tempo follows it as soon as it changes, and a tempo message marked as a beat is sent on
// every downbeat, timed to the millisecond, so sequences and effects start their bars with the music (ADR 0010).
import { useEffect, useRef } from 'react';

import { heardDeck, nextDownbeat } from '../utils/deckMaths.js';
import { clampBpm } from '../utils/tempo.js';

/** How often the music is looked at, in milliseconds. */
const TICK_MS = 100;
/** A downbeat this close (in seconds) is scheduled now. */
const LOOKAHEAD = 0.3;

/**
 * @param {{
 *   decksRef: { current: import('./useDecks.js').DeckState[] },
 *   crossfaderRef: { current: number },
 *   elementOf: (index: number) => HTMLAudioElement | undefined,
 *   sendRef: { current: (message: object) => void },
 * }} options refs, read on every look, so the lock never restarts
 */
export function useBeatLock({ decksRef, crossfaderRef, elementOf: elementOfNow, sendRef }) {
  const elementOf = useRef(elementOfNow);
  elementOf.current = elementOfNow;
  useEffect(() => {
    let timer = 0;
    let sentBar = '';
    let sentBpm = 0;
    /** @type {Set<number>} */
    const pending = new Set();
    const tick = () => {
      const index = heardDeck(decksRef.current, crossfaderRef.current);
      const deck = decksRef.current[index];
      const element = index >= 0 ? elementOf.current(index) : undefined;
      if (deck?.analysis && element && !element.paused) {
        const rate = element.playbackRate;
        const bpm = clampBpm(Math.round(deck.analysis.bpm * rate * 10) / 10);
        if (Math.abs(bpm - sentBpm) >= 0.1) {
          sentBpm = bpm;
          sendRef.current({ type: 'tempo', bpm });
        }
        const next = nextDownbeat(deck.analysis, element.currentTime, rate);
        const key = `${deck.track?.id}:${next?.bar}`;
        if (next && next.wait < LOOKAHEAD && key !== sentBar) {
          sentBar = key;
          const id = window.setTimeout(() => {
            pending.delete(id);
            sendRef.current({ type: 'tempo', bpm, sync: true });
          }, next.wait * 1000);
          pending.add(id);
        }
      }
      timer = window.setTimeout(tick, TICK_MS);
    };
    tick();
    return () => {
      window.clearTimeout(timer);
      pending.forEach((id) => window.clearTimeout(id));
    };
  }, [decksRef, crossfaderRef, sendRef]);
}
