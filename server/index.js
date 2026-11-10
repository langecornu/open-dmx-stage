// Entry point: wires config, driver, engine, HTTP and WebSocket, and handles process lifecycle.
import { createServer } from 'node:http';

import { MockDriver } from './clients/mockDriver.js';
import { createOflClient } from './clients/oflClient.js';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { configureLogger, logger } from './logger.js';
import { DmxEngine } from './services/dmxEngine.js';
import { OutputManager } from './services/outputManager.js';
import { ProjectService } from './services/projectService.js';
import { attachLiveSocket } from './ws/liveSocket.js';

const config = loadConfig();
configureLogger({ level: config.logLevel, format: config.logFormat });
const log = logger.child({ module: 'server' });
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

const app = createApp({
  config,
  engine,
  projectService,
  outputManager,
  ofl: config.isOflEnabled ? createOflClient() : null,
});
const server = createServer(app);
const liveSocket = attachLiveSocket({
  server,
  engine,
  projectService,
  outputManager,
  allowedOrigins: config.allowedOrigins,
});

engine.start();
outputManager.startWatchdog();
server.listen(config.port, config.host, () => {
  log.info(
    { host: config.host, port: config.port, output: outputManager.settings.driver },
    'Open DMX Stage is listening',
  );
  if (config.host !== '127.0.0.1' && config.host !== 'localhost' && config.host !== '::1') {
    log.warn('Listening beyond this computer. The control surface has no login, so use a network you trust.');
  }
});

/** @param {string} signal */
async function shutdown(signal) {
  log.info({ signal }, 'Shutting down');
  outputManager.stopWatchdog();
  liveSocket.close();
  await engine.stop();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  log.error({ err: reason }, 'Unhandled rejection');
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  log.error({ err: error }, 'Uncaught exception');
  process.exit(1);
});
