// Process shutdown: stop the output cleanly, disconnect the browsers, close the HTTP server, then exit. A deadline makes
// sure the process always ends, so a restart (node --watch, Ctrl+C) never leaves the port held by a stuck process.

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * @param {{
 *   server: { close: (done: () => void) => unknown, closeAllConnections: () => void },
 *   liveSocket: { close: () => void },
 *   engine: { stop: () => Promise<void> },
 *   outputManager: { stopWatchdog: () => void },
 *   log: { info: Function, warn: Function, error: Function },
 *   exit?: (code: number) => void,
 *   timeoutMs?: number,
 * }} options
 * @returns {(signal: string) => Promise<void>} call on SIGTERM or SIGINT
 */
export function createShutdown({
  server,
  liveSocket,
  engine,
  outputManager,
  log,
  exit = process.exit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  let isShuttingDown = false;

  return async function shutdown(signal) {
    if (isShuttingDown) {
      log.warn({ signal }, 'Second stop signal, quitting now');
      exit(1);
      return;
    }
    isShuttingDown = true;
    log.info({ signal }, 'Shutting down');

    const deadline = setTimeout(() => {
      log.error({ timeoutMs }, 'Shutdown did not finish in time, quitting anyway');
      exit(1);
    }, timeoutMs);
    deadline.unref();

    outputManager.stopWatchdog();
    // The browsers' live sockets and idle keep-alive connections would otherwise keep server.close() waiting forever.
    liveSocket.close();
    const closed = new Promise((resolve) => server.close(() => resolve(undefined)));
    server.closeAllConnections();

    try {
      await engine.stop();
    } catch (error) {
      log.warn({ err: error }, 'The output did not close cleanly');
    }
    await closed;
    clearTimeout(deadline);
    exit(0);
  };
}
