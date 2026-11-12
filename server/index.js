// Entry point: wires config, driver, engine, HTTP and WebSocket, and handles process lifecycle.
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';

import { MockDriver } from './clients/mockDriver.js';
import { createOflClient } from './clients/oflClient.js';
import { createApp } from './app.js';
import { isLoopback, loadConfig, networkAddresses } from './config.js';
import { createShutdown } from './lifecycle.js';
import { configureLogger, logger } from './logger.js';
import { DmxEngine } from './services/dmxEngine.js';
import { loadOrCreateCertificate } from './services/localCertificate.js';
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

// The https address beside the http one (ADR 0009), with a certificate the app makes itself. If it cannot be set up,
// the app carries on over http and says why.
/** @type {import('./services/localCertificate.js').LocalCertificate | null} */
let certificate = null;
if (config.httpsPort) {
  try {
    certificate = await loadOrCreateCertificate({
      dataDir: config.dataDir,
      names: isLoopback(config.host) ? [] : networkAddresses(),
    });
    if (certificate.created) {
      log.info({ validTo: certificate.validTo, names: certificate.names }, 'Made a new certificate for https');
    }
  } catch (error) {
    log.error({ err: error }, 'Could not make the https certificate; the app runs over http only');
  }
}
const secureNames = certificate ? (isLoopback(config.host) ? ['localhost'] : networkAddresses()) : [];
const network = {
  httpsPort: certificate ? config.httpsPort : 0,
  fingerprint: certificate?.fingerprint ?? null,
  validTo: certificate?.validTo ?? null,
  addresses: secureNames
    .filter((name) => /^\d/.test(name) || name.endsWith('.local') || name === 'localhost')
    .map((name) => `https://${name}:${config.httpsPort}`),
};

const app = createApp({
  config,
  engine,
  projectService,
  outputManager,
  ofl: config.isOflEnabled ? createOflClient() : null,
  network,
});
const servers = [createServer(app)];
if (certificate) {
  servers.push(createSecureServer({ cert: certificate.cert, key: certificate.key }, app));
}
const liveSockets = servers.map((server) =>
  attachLiveSocket({ server, engine, projectService, outputManager, allowedOrigins: config.allowedOrigins }),
);

engine.start();
outputManager.startWatchdog();
servers[0].listen(config.port, config.host, () => {
  log.info(
    { host: config.host, port: config.port, output: outputManager.settings.driver },
    'Open DMX Stage is listening',
  );
  if (!isLoopback(config.host)) {
    log.warn('Listening beyond this computer. The control surface has no login, so use a network you trust.');
  }
});
if (servers[1]) {
  // A busy https port turns https off; it never stops the app.
  servers[1].on('error', (error) => {
    log.error({ err: error, port: config.httpsPort }, 'The https address could not start; the app runs over http only');
    network.httpsPort = 0;
    network.addresses = [];
  });
  servers[1].listen(config.httpsPort, config.host, () => {
    log.info({ addresses: network.addresses }, 'Also listening over https, for phones and tablets');
  });
}

// Shutdown treats both servers and both live links as one.
const shutdown = createShutdown({
  server: {
    close: (/** @type {() => void} */ done) => {
      let open = servers.length;
      for (const server of servers) {
        server.close(() => {
          open -= 1;
          if (open === 0) {
            done();
          }
        });
      }
    },
    closeAllConnections: () => servers.forEach((server) => server.closeAllConnections()),
  },
  liveSocket: { close: () => liveSockets.forEach((socket) => socket.close()) },
  engine,
  outputManager,
  log,
});

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
