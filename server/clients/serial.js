// Shared serial helpers: list ports (with USB ids so the UI can recognise FTDI cables) and open one by options.
// Serial access uses the MIT-licensed `serialport` package (https://serialport.io).
import { logger } from '../logger.js';

const log = logger.child({ module: 'serial' });

/**
 * @returns {Promise<{ path: string, manufacturer: string, serialNumber: string, vendorId: string, productId: string }[]>}
 * @throws {Error} when serial support is not available on this computer (the `serialport` module cannot load or list)
 */
export async function listSerialPorts() {
  try {
    const { SerialPort } = await import('serialport');
    const ports = await SerialPort.list();
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer ?? '',
      serialNumber: port.serialNumber ?? '',
      vendorId: port.vendorId ?? '',
      productId: port.productId ?? '',
    }));
  } catch (error) {
    // Distinguish "serial support is missing" from "no ports plugged in": callers turn this into a clear message.
    log.error({ err: error }, 'Could not list serial ports');
    throw new Error('Serial support is not available', { cause: error });
  }
}

/**
 * @param {import('../../shared/types.js').SerialOptions} options
 * @returns {Promise<import('../../shared/types.js').SerialPortLike>}
 */
export async function openSerialPort(options) {
  const { SerialPort } = await import('serialport');
  return new Promise((resolve, reject) => {
    const port = new SerialPort(
      /** @type {import('serialport').SerialPortOpenOptions<import('@serialport/bindings-cpp').AutoDetectTypes>} */ (
        options
      ),
      (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(/** @type {import('../../shared/types.js').SerialPortLike} */ (/** @type {unknown} */ (port)));
        }
      },
    );
  });
}
