// Runs a drawing function on every screen refresh, for animation that reads live values (a deck's position) and
// updates the page directly, so the screen does not re-render sixty times a second.
import { useEffect, useRef } from 'react';

/**
 * @param {(now: number) => void} draw called once per frame with the time, in milliseconds
 */
export function useAnimationFrame(draw) {
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    let frame = 0;
    const step = (now) => {
      drawRef.current(now);
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, []);
}
