// Single error middleware: safe message plus a correlation id, never raw exception text to clients.
import { randomUUID } from 'node:crypto';

export function errorHandler(err, req, res, _next) {
  const correlationId = randomUUID();
  const status = Number.isInteger(err.status) ? err.status : 500;
  if (status >= 500) {
    console.error(`[http] ${correlationId} ${req.method} ${req.path}`, err);
  }
  const message = status >= 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: message, correlationId });
}
