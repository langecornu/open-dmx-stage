// Web MIDI access for the Perform screen. MIDI is off until the person turns it on (the browser asks permission),
// works with whichever controllers are plugged in, and follows them being plugged in or out. Web MIDI is available in
// Chrome, Edge and other Chromium browsers; Safari and Firefox do not support it everywhere.
import { useCallback, useEffect, useRef, useState } from 'react';

import { parseMidiMessage } from '../utils/midi.js';

/**
 * @param {{ onMessage: (message: import('../utils/midi.js').MidiMessage) => void }} options
 * @returns {{ status: 'unsupported' | 'idle' | 'requesting' | 'ready' | 'denied', inputNames: string[], enable: () => Promise<void> }}
 */
export function useMidi({ onMessage }) {
  const isSupported = typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  const [status, setStatus] = useState(isSupported ? 'idle' : 'unsupported');
  const [inputNames, setInputNames] = useState([]);
  const accessRef = useRef(null);
  const isMountedRef = useRef(true);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  const attach = useCallback((access) => {
    const names = [];
    for (const input of access.inputs.values()) {
      names.push(input.name ?? 'MIDI input');
      input.onmidimessage = (event) => {
        const message = parseMidiMessage(event.data);
        if (message) {
          onMessageRef.current(message);
        }
      };
    }
    setInputNames(names);
  }, []);

  const enable = useCallback(async () => {
    if (!isSupported) {
      return;
    }
    setStatus('requesting');
    try {
      const access = await navigator.requestMIDIAccess();
      if (!isMountedRef.current) {
        return; // the screen closed while the browser was asking; do not listen on its behalf
      }
      accessRef.current = access;
      access.onstatechange = () => attach(access);
      attach(access);
      setStatus('ready');
    } catch {
      if (isMountedRef.current) {
        setStatus('denied');
      }
    }
  }, [attach, isSupported]);

  // Stop listening when the screen closes. Setting the flag on mount too keeps this correct under React StrictMode,
  // which mounts, unmounts and mounts again in development.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const access = accessRef.current;
      if (access) {
        access.onstatechange = null;
        for (const input of access.inputs.values()) {
          input.onmidimessage = null;
        }
      }
    };
  }, []);

  return { status, inputNames, enable };
}
