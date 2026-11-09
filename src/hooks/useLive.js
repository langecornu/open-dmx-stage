// Live link to the server: streams the DMX frame and engine state, and sends control messages.
import { useCallback, useEffect, useRef, useState } from 'react';

const RECONNECT_MS = 1500;
const EMPTY_FRAME = new Array(512).fill(0);
const INITIAL_STATE = {
  master: 1,
  blackout: false,
  activeSceneId: null,
  activeChaseId: null,
  chaseStep: null,
  programmerChannels: [],
};

export function useLive() {
  const [connected, setConnected] = useState(false);
  const [frame, setFrame] = useState(EMPTY_FRAME);
  const [engine, setEngine] = useState(INITIAL_STATE);
  const [output, setOutput] = useState(null);
  const socketRef = useRef(null);
  const pendingValues = useRef({});
  const flushHandle = useRef(null);

  useEffect(() => {
    let isCurrent = true;
    let retryTimer = null;

    const connect = () => {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${scheme}://${window.location.host}/live`);
      socketRef.current = socket;
      socket.onopen = () => isCurrent && setConnected(true);
      socket.onclose = () => {
        if (!isCurrent) {
          return;
        }
        setConnected(false);
        retryTimer = setTimeout(connect, RECONNECT_MS);
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'frame') {
          setFrame(message.frame);
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

  return { connected, frame, engine, output, send, setChannels };
}
