// The live DMX frame (512 values) arrives about 15 times a second. Keeping it in a small external store, read with
// useSyncExternalStore, means only the components that show it re-render, not the whole app (Standards 4.6).
import { useSyncExternalStore } from 'react';

const EMPTY_FRAME = new Array(512).fill(0);

/** @type {number[]} */
let current = EMPTY_FRAME;
/** @type {Set<() => void>} */
const listeners = new Set();

export const frameStore = {
  /** @returns {number[]} the latest frame */
  get: () => current,
  /** @param {number[]} next */
  set(next) {
    current = next;
    for (const listener of listeners) {
      listener();
    }
  },
  /**
   * @param {() => void} listener
   * @returns {() => void} call to stop listening
   */
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** @returns {number[]} the latest frame; the component re-renders when it changes */
export function useFrame() {
  return useSyncExternalStore(frameStore.subscribe, frameStore.get);
}
