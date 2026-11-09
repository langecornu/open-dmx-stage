// Entry point: wires config, driver, engine, HTTP and WebSocket, and handles process lifecycle.
import { createServer } from 'node:http';

import { MockDriver } from './clients/mockDriver.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { DmxEngine } from './services/dmxEngine.js';
import { OutputManager } from './services/outputManager.js';
import { ProjectService } from './services/projectService.js';
import { attachLiveSocket } from './ws/liveSocket.js';

const config = loadConfig();
const projectService = new ProjectService({ dataDir: config.dataDir });
await projectService.load();

const engine = new DmxEngine({ driver: new MockDriver(), frameRate: config.dmxFrameRate });
const outputManager = new OutputManager({
  engine,
  dataDir: config.dataDir,
  defaults: {
    driver: config.dmxDriver,
    serialPath: config.dmxSerialPath,
    host: config.dmxNetHost,
    universe: config.dmxUniverse ?? (config.dmxDriver === 'sacn' ? 1 : 0),
  },
});
await outputManager.init();

const app = createApp({ config, engine, projectService, outputManager });
const server = createServer(app);
const liveSocket = attachLiveSocket({
  server,
  engine,
  projectService,
  outputManager,
  allowedOrigins: config.allowedOrigins,
});

engine.start();
server.listen(config.port, () => {
  console.log(
    `[server] Open DMX Stage API on http://localhost:${config.port} (output: ${outputManager.settings.driver})`,
  );
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
