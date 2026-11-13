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
// Faders send at most one message per screen refresh (120 a second on the fastest tablets), so a person stays well
// under this. A runaway or hostile client that floods the socket has its extra messages dropped, so it cannot starve
// the output for everyone else.
const MESSAGE_BURST = 480;
const MESSAGES_PER_SECOND = 240;
// More than enough phones and tablets for any show; refuses a pile of idle connections.
const MAX_CLIENTS = 64;

/**
 * A token bucket: allows a burst, then a steady rate.
 * @param {() => number} now milliseconds
 * @returns {() => boolean} true while the client is within its budget
 */
export function messageBudget(now = Date.now, burst = MESSAGE_BURST, perSecond = MESSAGES_PER_SECOND) {
  let tokens = burst;
  let last = now();
  return () => {
    const at = now();
    tokens = Math.min(burst, tokens + ((at - last) / 1000) * perSecond);
    last = at;
    if (tokens < 1) {
      return false;
    }
    tokens -= 1;
    return true;
  };
}

/** @typedef {import('ws').WebSocket & { isAlive?: boolean }} LiveClient */

/**
 * @param {{
 *   server: import('node:http').Server | import('node:https').Server,
 *   engine: import('../services/dmxEngine.js').DmxEngine,
 *   projectService: import('../services/projectService.js').ProjectService,
 *   outputManager: import('../services/outputManager.js').OutputManager,
 *   allowedOrigins: string[],
 *   heartbeatMs?: number,
 * }} options `heartbeatMs` is how often idle clients are pinged; tests shorten it.
 * @returns {{ close: () => void }}
 */
export function attachLiveSocket({
  server,
  engine,
  projectService,
  outputManager,
  allowedOrigins,
  heartbeatMs = HEARTBEAT_MS,
}) {
  const wss = new WebSocketServer({
    server,
    path: '/live',
    maxPayload: 64 * 1024,
    verifyClient: (/** @type {{ origin: string }} */ { origin }) =>
      (!origin || allowedOrigins.includes(origin)) && wss.clients.size < MAX_CLIENTS,
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
  }, heartbeatMs);

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
      case 'release':
        engine.releaseScene(message.fadeMs);
        break;
      case 'tempo':
        engine.setTempo(message.bpm, message.sync);
        break;
      case 'effectStart': {
        const group = message.groupId ? project.groups.find((candidate) => candidate.id === message.groupId) : null;
        if (message.groupId && !group) {
          break; // the group was deleted; do nothing rather than light every fixture
        }
        engine.startEffect({
          type: message.effect,
          beats: message.beats,
          groupId: group?.id ?? null,
          fixtureIds: group ? group.fixtureIds : null,
        });
        break;
      }
      case 'effectStop':
        engine.stopEffect();
        break;
      case 'mute':
        engine.setMute(message.fixtureId, message.muted);
        break;
      case 'solo':
        engine.setSolo(message.fixtureId, message.soloed);
        break;
      case 'clearMuteSolo':
        engine.clearMuteSolo();
        break;
      case 'autoStart':
        engine.startAuto(message, project);
        break;
      case 'autoStop':
        engine.stopAuto();
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
    const isWithinBudget = messageBudget();
    let lastWarnedAt = 0;
    socket.on('message', (data) => {
      if (!isWithinBudget()) {
        if (Date.now() - lastWarnedAt > 1000) {
          lastWarnedAt = Date.now();
          log.warn('A client is sending too many messages; the extra ones are dropped');
          send(socket, { type: 'error', message: 'Too many messages' });
        }
        return;
      }
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
      // wss.close() alone leaves connected browsers open, and they would hold the HTTP server open on shutdown. The
      // browser reconnects with backoff when the server is back.
      for (const client of wss.clients) {
        client.terminate();
      }
      wss.close();
    },
  };
}
