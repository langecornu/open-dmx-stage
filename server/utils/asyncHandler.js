// Wraps an async Express handler so rejected promises reach the error middleware.
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
