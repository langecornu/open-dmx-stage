// WebSocket endpoint for low-latency control (faders, recall, chases) and live frame/state streaming.
// Clients are checked with ping and pong so a dead connection is dropped, and the first message is a `hello` carrying
// the protocol version so an old browser tab and a new server can tell they differ.
import { WebSocketServer } from 'ws';

import { logger } from '../logger.js';
import { liveMessageSchema } from '../schemas/projectSchema.js';

const log = logger.child({ module: 'live-socket' });

export const PROTOCOL_VERSION = 1;
const FRAME_BROADCAST_MS = 66;
const STATUS_CHECK_MS = 2000;
const HEARTBEAT_MS = 15000;

/** @typedef {import('ws').WebSocket & { isAlive?: boolean }} LiveClient */

/**
 * @param {{
 *   server: import('node:http').Server,
 *   engine: import('../services/dmxEngine.js').DmxEngine,
 *   projectService: import('../services/projectService.js').ProjectService,
 *   outputManager: import('../services/outputManager.js').OutputManager,
 *   allowedOrigins: string[],
 * }} options
 * @returns {{ close: () => void }}
 */
export function attachLiveSocket({ server, engine, projectService, outputManager, allowedOrigins }) {
  const wss = new WebSocketServer({
    server,
    path: '/live',
    maxPayload: 64 * 1024,
    verifyClient: (/** @type {{ origin: string }} */ { origin }) => !origin || allowedOrigins.includes(origin),
  });

  /**
   * @param {import('ws').WebSocket} socket
   * @param {unknown} message
   */
  const send = (socket, message) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  /** @param {string} payload */
  const broadcast = (payload) => {
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  };

  let lastFrameAt = 0;
  const unsubscribe = engine.subscribe((event) => {
    if (event.type === 'frame') {
      const at = Date.now();
      if (at - lastFrameAt < FRAME_BROADCAST_MS) {
        return;
      }
      lastFrameAt = at;
      broadcast(JSON.stringify({ type: 'frame', frame: Array.from(event.frame) }));
      return;
    }
    broadcast(JSON.stringify(event));
  });

  // Push output status on change, and re-check every couple of seconds so an unplugged cable shows up.
  let lastStatus = '';
  const broadcastStatus = () => {
    if (wss.clients.size === 0) {
      return;
    }
    const payload = JSON.stringify({ type: 'output', status: outputManager.getStatus() });
    if (payload === lastStatus) {
      return;
    }
    lastStatus = payload;
    broadcast(payload);
  };
  const unsubscribeOutput = outputManager.subscribe(broadcastStatus);
  const statusTimer = setInterval(broadcastStatus, STATUS_CHECK_MS);

  // Drop clients that stop answering pings (closed laptop lid, lost Wi-Fi) so they do not pile up.
  const heartbeatTimer = setInterval(() => {
    for (const client of /** @type {Set<LiveClient>} */ (wss.clients)) {
      if (client.isAlive === false) {
        client.terminate();
      } else {
        client.isAlive = false;
        client.ping();
      }
    }
  }, HEARTBEAT_MS);

  /** @param {import('zod').z.infer<typeof liveMessageSchema>} message */
  const handleMessage = (message) => {
    const project = projectService.get();
    switch (message.type) {
      case 'set':
        engine.setProgrammer(message.values);
        break;
      case 'clearProgrammer':
        engine.clearProgrammer();
        break;
      case 'master':
        engine.setMaster(message.level);
        break;
      case 'blackout':
        engine.setBlackout(message.enabled);
        break;
      case 'recall': {
        const scene = project.scenes.find((candidate) => candidate.id === message.sceneId);
        if (scene) {
          engine.recallScene(scene, message.fadeMs);
        }
        break;
      }
      case 'chaseStart': {
        const chase = project.chases.find((candidate) => candidate.id === message.chaseId);
        if (chase) {
          engine.startChase(chase, new Map(project.scenes.map((scene) => [scene.id, scene])));
        }
        break;
      }
      case 'chaseStop':
        engine.stopChase();
        break;
      default:
        break;
    }
  };

  wss.on('connection', (/** @type {LiveClient} */ socket) => {
    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });
    send(socket, { type: 'hello', version: PROTOCOL_VERSION });
    send(socket, { type: 'state', state: engine.getState() });
    send(socket, { type: 'output', status: outputManager.getStatus() });
    socket.on('message', (data) => {
      let parsed;
      try {
        parsed = liveMessageSchema.safeParse(JSON.parse(data.toString()));
      } catch {
        send(socket, { type: 'error', message: 'Malformed message' });
        return;
      }
      if (!parsed.success) {
        send(socket, { type: 'error', message: 'Invalid message' });
        return;
      }
      handleMessage(parsed.data);
    });
    socket.on('error', (error) => log.warn({ err: error }, 'Socket error'));
  });

  return {
    close: () => {
      unsubscribe();
      unsubscribeOutput();
      clearInterval(statusTimer);
      clearInterval(heartbeatTimer);
      wss.close();
    },
  };
}
