// Turns a Node-style callback call into a promise, for APIs such as serial ports that report completion by callback.

/**
 * @param {(done: (error?: Error | null) => void) => void} call receives the callback to pass to the API
 * @returns {Promise<void>}
 */
export function asPromise(call) {
  return new Promise((resolve, reject) => {
    call((error) => (error ? reject(error) : resolve()));
  });
}
