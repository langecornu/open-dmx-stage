// Shared HTTP error factory so every route fails the same way.
export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
