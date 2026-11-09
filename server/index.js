// Entry point: wires config, driver, engine, HTTP and WebSocket, and handles process lifecycle.
import { createServer } from 'node:http';

import { EnttecProDriver } from './clients/enttecProDriver.js';
import { MockDriver } from './clients/mockDriver.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { DmxEngine } from './services/dmxEngine.js';
import { ProjectService } from './services/projectService.js';
import { attachLiveSocket } from './ws/liveSocket.js';

const config = loadConfig();
const driver =
  config.dmxDriver === 'enttec-pro' ? new EnttecProDriver({ path: config.dmxSerialPath }) : new MockDriver();

try {
  await driver.open();
} catch (error) {
  console.error(`[dmx] Could not open ${driver.name}: ${error.message}`);
  process.exit(1);
}

const projectService = new ProjectService({ dataDir: config.dataDir });
await projectService.load();

const engine = new DmxEngine({ driver, frameRate: config.dmxFrameRate });
const app = createApp({ config, engine, projectService });
const server = createServer(app);
const liveSocket = attachLiveSocket({ server, engine, projectService, allowedOrigins: config.allowedOrigins });

engine.start();
server.listen(config.port, () => {
  console.log(`[server] Open DMX Studio API on http://localhost:${config.port} (driver: ${driver.name})`);
});

async function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down`);
  liveSocket.close();
  await engine.stop();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  console.error('[server] Uncaught exception:', error);
  process.exit(1);
});
