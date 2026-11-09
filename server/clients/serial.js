// Shared serial helpers: list ports (with USB ids so the UI can recognise FTDI cables) and open one by options.
// Serial access uses the MIT-licensed `serialport` package (https://serialport.io).
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
    console.error('[dmx] Could not list serial ports:', error.message);
    return [];
  }
}

export async function openSerialPort(options) {
  const { SerialPort } = await import('serialport');
  return new Promise((resolve, reject) => {
    const port = new SerialPort(options, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve(port);
      }
    });
  });
}
