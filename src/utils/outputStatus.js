// The output status in plain words, shared by the top bar and the Perform status strip so they always agree.

/**
 * @param {boolean} connected whether the browser is linked to the server
 * @param {{ driver: string, connected: boolean } | null | undefined} output
 * @returns {{ label: string, isReady: boolean }}
 */
export function describeOutput(connected, output) {
  const isReady = Boolean(connected && output?.connected);
  if (!connected) {
    return { label: 'Server offline', isReady };
  }
  if (output?.driver === 'mock') {
    return { label: 'Simulator', isReady };
  }
  return { label: output?.connected ? 'DMX ready' : 'DMX not connected', isReady };
}
