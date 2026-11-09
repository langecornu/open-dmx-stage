// Live link to the server: engine state and output status, the DMX frame (through frameStore), and control messages.
// It reconnects with exponential backoff and jitter, so a restarting server is not hammered and many tabs do not retry
// in lockstep, and it resyncs from the server's first messages after every reconnect.
import { useCallback, useEffect, useRef, useState } from 'react';

import { frameStore } from './frameStore.js';

const SUPPORTED_PROTOCOL = 1;
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 15000;
const INITIAL_STATE = {
  master: 1,
  blackout: false,
  activeSceneId: null,
  activeChaseId: null,
  chaseStep: null,
  programmerChannels: [],
};

/**
 * Delay before reconnect attempt number `attempt` (0 for the first): doubles each time up to a cap, then jitters
 * between 50% and 100% of that so clients do not retry together.
 * @param {number} attempt
 * @param {() => number} [random] injectable for tests
 * @returns {number} milliseconds
 */
export function reconnectDelay(attempt, random = Math.random) {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** attempt);
  return Math.round(base * (0.5 + random() / 2));
}

export function useLive() {
  const [connected, setConnected] = useState(false);
  const [engine, setEngine] = useState(INITIAL_STATE);
  const [output, setOutput] = useState(null);
  const [isVersionMismatch, setIsVersionMismatch] = useState(false);
  const socketRef = useRef(null);
  const pendingValues = useRef({});
  const flushHandle = useRef(null);

  useEffect(() => {
    let isCurrent = true;
    let retryTimer = null;
    let attempt = 0;

    const connect = () => {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${scheme}://${window.location.host}/live`);
      socketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
        if (isCurrent) {
          setConnected(true);
        }
      };
      socket.onclose = () => {
        if (!isCurrent) {
          return;
        }
        setConnected(false);
        retryTimer = setTimeout(connect, reconnectDelay(attempt));
        attempt += 1;
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        // Unknown message types are ignored, so a newer server does not break an older page.
        if (message.type === 'hello') {
          setIsVersionMismatch(message.version !== SUPPORTED_PROTOCOL);
        } else if (message.type === 'frame') {
          frameStore.set(message.frame);
        } else if (message.type === 'state') {
          setEngine(message.state);
        } else if (message.type === 'output') {
          setOutput(message.status);
        }
      };
    };

    connect();
    return () => {
      isCurrent = false;
      clearTimeout(retryTimer);
      cancelAnimationFrame(flushHandle.current);
      socketRef.current?.close();
    };
  }, []);

  const send = useCallback((message) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }, []);

  // Coalesce fader movement to one message per animation frame.
  const setChannels = useCallback(
    (values) => {
      Object.assign(pendingValues.current, values);
      if (flushHandle.current) {
        return;
      }
      flushHandle.current = requestAnimationFrame(() => {
        flushHandle.current = null;
        send({ type: 'set', values: pendingValues.current });
        pendingValues.current = {};
      });
    },
    [send],
  );

  return { connected, engine, output, isVersionMismatch, send, setChannels };
}
