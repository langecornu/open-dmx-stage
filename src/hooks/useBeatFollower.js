// Listens to music (the microphone, or the sound of a browser tab), finds the beat, and tells the server the tempo, so
// the effects and the sequences timed in beats follow the music. The sound is analysed inside this page by an audio
// worklet; it is not recorded and it never leaves the computer. Only tempo messages go to the server.
import { useCallback, useEffect, useRef, useState } from 'react';

import { createBeatDetector, smoothTempo, tempoFromBeats } from '../utils/beatDetector.js';

export const SOURCES = /** @type {const} */ ({ MICROPHONE: 'microphone', TAB: 'tab' });

const WORKLET_URL = new URL('../audio/beatMeterWorklet.js', import.meta.url).href;
const LEVEL_EVERY = 3; // update the level meter every third 20 ms window
const CHECK_EVERY = 10; // and check for silence every tenth
const SILENCE_MS = 4000; // no beat for this long means the tempo is no longer locked
const KEPT_BEATS = 24;

/** @param {unknown} error @param {string} source @returns {string} */
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

/**
 * @param {{ send: (message: object) => void }} options
 * @returns {{
 *   status: 'off' | 'asking' | 'listening',
 *   level: number, bpm: number | null, isLocked: boolean, error: string | null,
 *   inputs: { id: string, label: string }[],
 *   start: (options: { source: string, deviceId?: string }) => Promise<void>,
 *   stop: () => void,
 * }}
 */
export function useBeatFollower({ send }) {
  const [state, setState] = useState({ status: 'off', level: 0, bpm: null, isLocked: false, error: null });
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
    setState((current) =>
      current.status === 'off' ? current : { status: 'off', level: 0, bpm: null, isLocked: false, error: null },
    );
  }, []);

  const start = useCallback(
    async ({ source, deviceId }) => {
      stop();
      setState({ status: 'asking', level: 0, bpm: null, isLocked: false, error: null });
      const fail = (/** @type {string} */ message) =>
        setState({ status: 'off', level: 0, bpm: null, isLocked: false, error: message });

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

      const detector = createBeatDetector();
      /** @type {number[]} */
      let beats = [];
      /** @type {number | null} */
      let tempo = null;
      let windows = 0;
      let peak = 0.01;
      let lastBeatAt = -Infinity;
      node.port.onmessage = (/** @type {MessageEvent<{ energy: number, time: number }>} */ event) => {
        const { energy, time } = event.data;
        windows += 1;
        peak = Math.max(energy, peak * 0.997);
        if (detector.feed(energy, time)) {
          lastBeatAt = time;
          beats = [...beats, time].slice(-KEPT_BEATS);
          const estimate = tempoFromBeats(beats);
          if (estimate) {
            tempo = smoothTempo(tempo, estimate.bpm);
            // Each beat also lines the beat up on the server, so effects land on the music.
            sendRef.current({ type: 'tempo', bpm: tempo, sync: true });
            setState((current) => ({ ...current, bpm: tempo, isLocked: true }));
          }
        }
        if (windows % LEVEL_EVERY === 0) {
          const level = Math.min(1, energy / peak);
          setState((current) => (current.status === 'listening' ? { ...current, level } : current));
        }
        if (windows % CHECK_EVERY === 0 && time - lastBeatAt > SILENCE_MS) {
          setState((current) => (current.isLocked ? { ...current, isLocked: false } : current));
        }
      };
      for (const track of stream.getAudioTracks()) {
        track.addEventListener('ended', stop); // the person stopped sharing, or unplugged the microphone
      }
      sessionRef.current = { stream, context, node };
      setState({ status: 'listening', level: 0, bpm: null, isLocked: false, error: null });
      refreshInputs();
    },
    [refreshInputs, stop],
  );

  useEffect(() => stop, [stop]); // stop listening when the screen closes

  return { ...state, inputs, start, stop };
}
