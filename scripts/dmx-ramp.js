// Hardware check: ramps DMX channel 1 (or the first few channels, with --channels) from 0 to 255 for a few seconds on
// the chosen output, so anyone with an adapter and a light on address 1 can confirm the output works without opening the
// app. It uses the same drivers as the app. Many lights have a master dimmer on channel 1, so they stay dark until their
// colour channels are up too: for a 4 channel light (dimmer, red, green, blue) use --channels 4.
//
//   npm run dmx:ramp -- --list
//   npm run dmx:ramp -- --driver open-dmx --port /dev/tty.usbserial-XXXX --channels 4
//   npm run dmx:ramp -- --driver artnet --host 192.168.1.50 --universe 0
import { parseArgs } from 'node:util';

import { listSerialPorts } from '../server/clients/serial.js';
import { createDriver } from '../server/services/outputManager.js';
import { outputSettingsSchema } from '../server/schemas/projectSchema.js';

const FRAME_MS = 33;

const { values } = parseArgs({
  options: {
    list: { type: 'boolean', default: false },
    driver: { type: 'string', default: 'open-dmx' },
    port: { type: 'string', default: '' },
    host: { type: 'string', default: '' },
    universe: { type: 'string' },
    seconds: { type: 'string', default: '6' },
    channels: { type: 'string', default: '1' },
  },
});

async function main() {
  if (values.list) {
    const ports = await listSerialPorts();
    console.log(
      ports.length === 0
        ? 'No serial ports found.'
        : ports.map((port) => `${port.path}  ${port.manufacturer}`).join('\n'),
    );
    return;
  }

  const channelCount = Number(values.channels);
  if (!Number.isInteger(channelCount) || channelCount < 1 || channelCount > 512) {
    throw new Error('--channels must be a whole number from 1 to 512');
  }
  const settings = outputSettingsSchema.parse({
    driver: values.driver,
    serialPath: values.port,
    host: values.host,
    universe: values.universe === undefined ? undefined : Number(values.universe),
  });
  const driver = createDriver({ ...settings, universe: settings.universe ?? 0 });
  await driver.open();
  console.log(
    `Opened ${driver.name}. Channels 1 to ${channelCount} will ramp 0 to 255 over ${values.seconds} s. Watch the light on address 1.`,
  );

  const frame = new Uint8Array(512);
  const totalFrames = Math.round((Number(values.seconds) * 1000) / FRAME_MS);
  for (let index = 0; index <= totalFrames; index += 1) {
    frame.fill(Math.round((index / totalFrames) * 255), 0, channelCount);
    driver.send(frame);
    if (index % 30 === 0) {
      console.log(`channels 1 to ${channelCount} = ${frame[0]}  status: ${JSON.stringify(driver.getStatus())}`);
    }
    await new Promise((resolve) => setTimeout(resolve, FRAME_MS));
  }

  driver.send(new Uint8Array(512));
  await driver.close();
  console.log('Done. Output blanked and closed. Please report what you saw (adapter, system, result).');
}

main().catch((error) => {
  console.error(`Ramp test failed: ${error.message}`);
  process.exitCode = 1;
});
