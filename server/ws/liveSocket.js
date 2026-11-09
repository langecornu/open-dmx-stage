// WebSocket endpoint for low-latency control (faders, recall, chases) and live frame/state streaming.
import { WebSocketServer } from 'ws';

import { liveMessageSchema } from '../schemas/projectSchema.js';

const FRAME_BROADCAST_MS = 66;

export function attachLiveSocket({ server, engine, projectService, outputManager, allowedOrigins }) {
  const wss = new WebSocketServer({
    server,
    path: '/live',
    maxPayload: 64 * 1024,
    verifyClient: ({ origin }) => !origin || allowedOrigins.includes(origin),
  });

  const send = (socket, message) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
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
      const payload = JSON.stringify({ type: 'frame', frame: Array.from(event.frame) });
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) {
          client.send(payload);
        }
      }
      return;
    }
    const payload = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
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
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  };
  const unsubscribeOutput = outputManager.subscribe(broadcastStatus);
  const statusTimer = setInterval(broadcastStatus, 2000);

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

  wss.on('connection', (socket) => {
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
  });

  return {
    close: () => {
      unsubscribe();
      unsubscribeOutput();
      clearInterval(statusTimer);
      wss.close();
    },
  };
}
