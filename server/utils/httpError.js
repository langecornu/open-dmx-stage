// Shared HTTP error factory so every route fails the same way.
/**
 * @param {number} status HTTP status code
 * @param {string} message safe to show to the client
 * @returns {Error & { status: number }}
 */
export function httpError(status, message) {
  const error = /** @type {Error & { status: number }} */ (new Error(message));
  error.status = status;
  return error;
}
