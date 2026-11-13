// Listens to music (the microphone, or the sound of a browser tab), finds the beat, and tells the server the tempo, so
// the effects and the sequences timed in beats follow the music. The sound is analysed inside this page by an audio
// worklet; it is not recorded and it never leaves the computer. Only tempo messages go to the server.
import { useCallback, useEffect, useRef, useState } from 'react';

import { createBeatTracker } from '../utils/beatTracker.js';

export const SOURCES = /** @type {const} */ ({ MICROPHONE: 'microphone', TAB: 'tab' });

const WORKLET_URL = new URL('../audio/beatMeterWorklet.js', import.meta.url).href;
const SHOW_EVERY = 3; // update what is shown every third 20 ms window
const TEMPO_STEP = 0.3; // send a tempo change without a beat only when it moved by at least this much

/** @param {unknown} error @param {string} source @returns {string} */
/** Shown when the page was opened at this computer's network address (plain http), as on a phone. */
export const INSECURE_MESSAGE =
  'Browsers only allow the microphone on secure pages. Open the app at its secure address (https, shown in Settings under Phones and tablets), or listen on the computer running Open DMX Stage. The lights follow the tempo for every device either way.';

function describeError(error, source) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotFoundError') {
    return 'No microphone was found.';
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return source === SOURCES.TAB
      ? 'Nothing was shared. Choose a tab and tick the box to share its sound.'
      : 'The browser did not allow the microphone. Allow it from the address bar, then try again.';
  }
  return 'Could not start listening. Check the sound source and try again.';
}

const OFF = {
  status: 'off',
  level: 0,
  bpm: null,
  isLocked: false,
  error: null,
  beatsHeard: 0,
  candidateBpm: null,
  confidence: 0,
};

/**
 * @param {{ send: (message: object) => void }} options
 * @returns {{
 *   status: 'off' | 'asking' | 'listening',
 *   level: number, bpm: number | null, isLocked: boolean, error: string | null,
 *   beatsHeard: number, candidateBpm: number | null, confidence: number,
 *   inputs: { id: string, label: string }[],
 *   start: (options: { source: string, deviceId?: string }) => Promise<void>,
 *   stop: () => void,
 * }}
 */
export function useBeatFollower({ send }) {
  const [state, setState] = useState(OFF);
  const [inputs, setInputs] = useState(/** @type {{ id: string, label: string }[]} */ ([]));
  const sessionRef = useRef(
    /** @type {null | { stream: MediaStream, context: AudioContext, node: AudioWorkletNode }} */ (null),
  );
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  const refreshInputs = useCallback(async () => {
    try {
      if (!navigator.mediaDevices) {
        setInputs([]);
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputs(
        devices
          .filter((device) => device.kind === 'audioinput')
          .map((device, index) => ({ id: device.deviceId, label: device.label || `Microphone ${index + 1}` })),
      );
    } catch {
      setInputs([]);
    }
  }, []);

  useEffect(() => {
    refreshInputs();
  }, [refreshInputs]);

  const stop = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      session.node.port.onmessage = null;
      session.node.disconnect();
      for (const track of session.stream.getTracks()) {
        track.stop();
      }
      session.context.close();
    }
    setState((current) => (current.status === 'off' ? current : OFF));
  }, []);

  const start = useCallback(
    async ({ source, deviceId }) => {
      stop();
      setState({ ...OFF, status: 'asking' });
      const fail = (/** @type {string} */ message) => setState({ ...OFF, error: message });
      // Browsers only give the microphone to secure pages: https, or the app opened on its own computer.
      if (window.isSecureContext === false || !navigator.mediaDevices) {
        fail(INSECURE_MESSAGE);
        return;
      }

      /** @type {MediaStream} */
      let stream;
      try {
        stream =
          source === SOURCES.TAB
            ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
            : await navigator.mediaDevices.getUserMedia({
                audio: {
                  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: false,
                },
              });
      } catch (error) {
        fail(describeError(error, source));
        return;
      }
      if (source === SOURCES.TAB) {
        for (const track of stream.getVideoTracks()) {
          track.stop(); // only the sound is wanted
        }
        if (stream.getAudioTracks().length === 0) {
          fail('That tab shared no sound. Choose a tab again and tick the box to share its sound.');
          return;
        }
      }

      const AudioContextClass = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
      if (!AudioContextClass) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        fail('This browser cannot analyse sound. Use a recent Chrome, Edge or Safari.');
        return;
      }
      const context = new AudioContextClass();
      let node;
      try {
        await context.audioWorklet.addModule(WORKLET_URL);
        node = new AudioWorkletNode(context, 'beat-meter');
      } catch {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        context.close();
        fail('Could not start the sound analyser in this browser.');
        return;
      }
      // The worklet only runs while it is connected to the output, so it goes through a gain of zero: nothing is played.
      const silent = context.createGain();
      silent.gain.value = 0;
      context.createMediaStreamSource(stream).connect(node);
      node.connect(silent);
      silent.connect(context.destination);
      if (context.state === 'suspended') {
        await context.resume();
      }

      const tracker = createBeatTracker();
      /** @type {number | null} */
      let sentTempo = null;
      let windows = 0;
      let peak = 1e-6;
      node.port.onmessage = (/** @type {MessageEvent<{ low: number, full: number, time: number }>} */ event) => {
        const { low, full, time } = event.data;
        windows += 1;
        const result = tracker.feed({ low, full }, time);
        peak = Math.max(full, peak * 0.997);
        if (result.bpm !== null) {
          if (result.isBeat) {
            // Each beat that fits the tempo also lines the beat up on the server, so effects land on the music.
            sendRef.current({ type: 'tempo', bpm: result.bpm, sync: true });
            sentTempo = result.bpm;
          } else if (sentTempo === null || Math.abs(result.bpm - sentTempo) >= TEMPO_STEP) {
            sendRef.current({ type: 'tempo', bpm: result.bpm, sync: false });
            sentTempo = result.bpm;
          }
        } else {
          sentTempo = null;
        }
        if (windows % SHOW_EVERY === 0) {
          const level = Math.min(1, full / peak);
          setState((current) =>
            current.status === 'listening'
              ? {
                  ...current,
                  level,
                  bpm: result.bpm,
                  isLocked: result.bpm !== null,
                  beatsHeard: result.beatsHeard,
                  candidateBpm: result.candidateBpm,
                  confidence: result.confidence,
                }
              : current,
          );
        }
      };
      for (const track of stream.getAudioTracks()) {
        track.addEventListener('ended', stop); // the person stopped sharing, or unplugged the microphone
      }
      sessionRef.current = { stream, context, node };
      setState({ ...OFF, status: 'listening' });
      refreshInputs();
    },
    [refreshInputs, stop],
  );

  useEffect(() => stop, [stop]); // stop listening when the screen closes

  return { ...state, inputs, start, stop };
}
