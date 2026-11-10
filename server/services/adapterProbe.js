// Works out what kind of USB-DMX adapter is on a serial port, so people do not have to guess between "USB-DMX cable"
// (a passive cable) and "ENTTEC DMX USB Pro" (an adapter with its own processor).
//
// An active adapter speaks the ENTTEC Pro protocol: ask it for its widget parameters (label 3) and it answers with its
// firmware version, break time, mark-after-break time and refresh rate. A passive cable has no processor and stays
// silent. Silence is therefore a strong hint, not proof (a wrong port or a busy device is silent too), and the result
// says so. This follows the published ENTTEC DMX USB Pro API but has not been tried on real hardware yet.
import { logger } from '../logger.js';
import { openSerialPort } from '../clients/serial.js';

const log = logger.child({ module: 'adapter-probe' });

const START_OF_MESSAGE = 0x7e;
const END_OF_MESSAGE = 0xe7;
const GET_WIDGET_PARAMETERS_LABEL = 3;
const PARAMETERS_LENGTH = 5; // firmware LSB, firmware MSB, break time, mark-after-break time, refresh rate

/** The request: label 3 with a 2-byte "user configuration size" of 0. */
export const WIDGET_PARAMETERS_REQUEST = Uint8Array.from([
  START_OF_MESSAGE,
  GET_WIDGET_PARAMETERS_LABEL,
  0x02,
  0x00,
  0x00,
  0x00,
  END_OF_MESSAGE,
]);

/**
 * Finds a valid "widget parameters" reply anywhere in the bytes received. The length must be exactly 5, which also
 * rules out a cable that simply echoes our own request back (that has a length of 2).
 * @param {Uint8Array} bytes
 * @returns {{ firmware: string, breakTime: number, markAfterBreakTime: number, refreshRate: number } | null}
 */
export function parseWidgetParameters(bytes) {
  for (let start = 0; start + 4 < bytes.length; start += 1) {
    if (bytes[start] !== START_OF_MESSAGE || bytes[start + 1] !== GET_WIDGET_PARAMETERS_LABEL) {
      continue;
    }
    const length = bytes[start + 2] | (bytes[start + 3] << 8);
    const end = start + 4 + length;
    if (length === PARAMETERS_LENGTH && bytes.length > end && bytes[end] === END_OF_MESSAGE) {
      const data = bytes.subarray(start + 4, end);
      return {
        firmware: `${data[1]}.${data[0]}`,
        breakTime: data[2],
        markAfterBreakTime: data[3],
        refreshRate: data[4],
      };
    }
  }
  return null;
}

/**
 * @typedef {object} ProbeResult
 * @property {'active' | 'no-response'} kind
 * @property {string} message plain-language explanation and next step
 * @property {'enttec-pro' | 'open-dmx'} suggestedInterface the interface to choose in the Connection card
 * @property {string} [firmware] for an active adapter
 */

/**
 * Opens the port briefly, asks the adapter to identify itself, and classifies the answer.
 * @param {string} path a serial port the operating system lists
 * @param {{
 *   createPort?: typeof openSerialPort,
 *   timeoutMs?: number,
 *   wait?: (ms: number) => Promise<unknown>,
 * }} [options] injectable for tests, so no hardware and no real waiting are needed
 * @returns {Promise<ProbeResult>}
 */
export async function probeAdapter(
  path,
  {
    createPort = openSerialPort,
    timeoutMs = 800,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  const port = await createPort({ path, baudRate: 57600 });
  /** @type {number[]} */
  const received = [];
  port.on('data', (/** @type {Uint8Array} */ chunk) => received.push(...chunk));
  try {
    port.write(WIDGET_PARAMETERS_REQUEST);
    // Poll so a quick answer returns quickly; give up after the timeout.
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs && !parseWidgetParameters(Uint8Array.from(received))) {
      await wait(25);
    }
  } finally {
    await new Promise((resolve) => port.close(() => resolve(undefined))).catch((error) => {
      log.warn({ err: error }, 'Could not close the probed port cleanly');
    });
  }
  const parameters = parseWidgetParameters(Uint8Array.from(received));
  if (parameters) {
    return {
      kind: 'active',
      firmware: parameters.firmware,
      suggestedInterface: 'enttec-pro',
      message: `This adapter answered like an ENTTEC DMX USB Pro (firmware ${parameters.firmware}), so it has its own processor. Choose "ENTTEC DMX USB Pro".`,
    };
  }
  return {
    kind: 'no-response',
    suggestedInterface: 'open-dmx',
    message:
      'The adapter did not answer. That is what a passive USB-DMX cable does, so choose "USB-DMX cable". If you are sure it is a Pro adapter, check that no other program is using it and try again.',
  };
}
