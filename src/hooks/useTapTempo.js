// Tap tempo for the Perform screen: each tap marks a beat; from the second tap the tempo is the average gap between
// recent taps. The first tap only lines the beat up, so effects and beat-timed sequences land on it.
import { useCallback, useEffect, useRef } from 'react';

import { addTap, bpmFromTaps } from '../utils/tempo.js';

/**
 * @param {{ send: (message: object) => void, bpm: number }} options
 * @returns {() => void} call once per tap
 */
export function useTapTempo({ send, bpm }) {
  const tapsRef = useRef(/** @type {number[]} */ ([]));
  const bpmRef = useRef(bpm);
  useEffect(() => {
    bpmRef.current = bpm;
  });
  return useCallback(() => {
    tapsRef.current = addTap(tapsRef.current, performance.now());
    send({ type: 'tempo', bpm: bpmFromTaps(tapsRef.current) ?? bpmRef.current, sync: true });
  }, [send]);
}
