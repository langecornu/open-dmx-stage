// Keyboard shortcuts for the Perform screen. Only active while the screen is open, and never while typing in a field.
import { useEffect, useRef } from 'react';

import { isTypingTarget } from '../utils/performKeys.js';

/**
 * @param {Record<string, () => void>} handlers functions by key, as `event.key` reports it (lower-case letters, digits,
 *   " " for Space, "Escape", "[" and "]")
 */
export function usePerformKeys(handlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || isTypingTarget(event.target)) {
        return;
      }
      const handler = handlersRef.current[event.key.length === 1 ? event.key.toLowerCase() : event.key];
      if (handler) {
        event.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
