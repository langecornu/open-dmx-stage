// Keyboard shortcuts for the Perform screen: which key plays which look or sequence, and when to ignore a key press.

// Looks and sequences take these keys in order; Space, Escape, [ and ] are reserved for blackout, stop and master.
export const PERFORM_KEYS = '1234567890qwertyuiopasdfghjkl'.split('');

/** @param {number} count @returns {string[]} the first `count` shortcut keys */
export function assignKeys(count) {
  return PERFORM_KEYS.slice(0, count);
}

/**
 * Typing into a field must never trigger a shortcut.
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
export function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
