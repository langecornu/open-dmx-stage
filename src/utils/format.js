// Small text formats shared by screens: a time as minutes and seconds, and a count with its word.

/**
 * A time as minutes and seconds.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * A count with its word, plural when it is not one: "1 look", "3 looks".
 * @param {number} count
 * @param {string} word
 * @returns {string}
 */
export function plural(count, word) {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}
