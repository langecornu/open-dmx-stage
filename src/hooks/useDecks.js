// The two decks: music from the library on the computer running the app, played on the device showing it. Kept at the
// top of the app, so a track keeps playing from Perform to the visualizer and back. Each deck streams its track through
// an <audio> element into Web Audio (channel volume, then the crossfader). Each track is analysed once for its tempo and
// first downbeat (kept by the library), and the lights lock to the deck being heard: its tempo is sent when it changes,
// and its beat on every downbeat, so sequences and effects follow the music exactly, with no microphone.
import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { api } from '../api.js';
import { crossfadeGains, peaksOf, PITCH_RANGE, pitchToMatch } from '../utils/deckMaths.js';
import { analyseSong, decodeMono } from '../utils/songAnalysis.js';
import { useBeatLock } from './useBeatLock.js';

/**
 * @typedef {import('../utils/deckMaths.js').Analysis} Analysis
 * @typedef {{ id: string, file: string, title: string, artist: string, album: string, duration: number | null,
 *   bpm: number | null }} Track
 * @typedef {{ track: Track | null, analysis: Analysis | null, isAnalysing: boolean, playing: boolean, cue: number,
 *   pitch: number, volume: number, error: string | null }} DeckState pitch: % from -8 to 8; volume 0 to 1
 * @typedef {{ context: AudioContext, elements: HTMLAudioElement[], channels: GainNode[], sides: GainNode[] }} Graph
 */

/** @type {DeckState} */
const EMPTY_DECK = {
  track: null,
  analysis: null,
  isAnalysing: false,
  playing: false,
  cue: 0,
  pitch: 0,
  volume: 1,
  error: null,
};

/**
 * Works out a track's tempo, first downbeat and waveform, in the browser.
 * @param {string} id
 * @returns {Promise<Analysis>}
 */
async function analyseTrack(id) {
  const { samples, sampleRate } = await decodeMono(await api.getTrackAudio(id));
  const song = analyseSong(samples, sampleRate);
  return {
    bpm: song.bpm,
    firstBeatSeconds: song.firstBeatSeconds,
    durationSeconds: song.durationSeconds,
    peaks: peaksOf(samples),
  };
}

/** @param {{ send: (message: object) => void }} options */
function useDeckEngine({ send }) {
  const [library, setLibrary] = useState(
    /** @type {{ folder: string, exists: boolean, tracks: Track[] } | null} */ (null),
  );
  const [libraryError, setLibraryError] = useState(/** @type {string | null} */ (null));
  const [decks, setDecks] = useState(/** @type {DeckState[]} */ ([EMPTY_DECK, EMPTY_DECK]));
  const [crossfader, setCrossfaderState] = useState(0);
  // The audio graph is made on the first tap: browsers only allow sound after one.
  const audio = useRef(/** @type {Graph | null} */ (null));
  const decksRef = useRef(decks);
  decksRef.current = decks;
  const crossfaderRef = useRef(crossfader);
  crossfaderRef.current = crossfader;
  const sendRef = useRef(send);
  sendRef.current = send;

  const refreshLibrary = useCallback(async (rescan = false) => {
    try {
      setLibrary(await api.getMusic(rescan));
      setLibraryError(null);
    } catch (error) {
      setLibraryError(error.message);
    }
  }, []);

  /** @param {string} folder @throws when the folder is not one */
  const setFolder = useCallback(async (folder) => {
    setLibrary(await api.setMusicFolder(folder));
    setLibraryError(null);
  }, []);

  /** @param {number} index @param {Partial<DeckState> | ((deck: DeckState) => Partial<DeckState>)} changes */
  const patchDeck = useCallback(
    (index, changes) =>
      setDecks((current) =>
        current.map((deck, at) =>
          at === index ? { ...deck, ...(typeof changes === 'function' ? changes(deck) : changes) } : deck,
        ),
      ),
    [],
  );

  /** @returns {Graph} */
  const graph = useCallback(() => {
    if (!audio.current) {
      const Context = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
      const context = new Context();
      const elements = [new Audio(), new Audio()];
      const channels = elements.map(() => context.createGain());
      const sides = elements.map(() => context.createGain());
      const gains = crossfadeGains(crossfaderRef.current);
      elements.forEach((element, index) => {
        element.preload = 'auto';
        // A tempo change moves the pitch too, as on a turntable.
        element.preservesPitch = false;
        context.createMediaElementSource(element).connect(channels[index]).connect(sides[index]);
        sides[index].connect(context.destination);
        channels[index].gain.value = decksRef.current[index].volume;
        sides[index].gain.value = gains[index];
        element.addEventListener('play', () => patchDeck(index, { playing: true }));
        element.addEventListener('pause', () => patchDeck(index, { playing: false }));
        element.addEventListener('ended', () => patchDeck(index, { playing: false }));
        element.addEventListener('error', () =>
          patchDeck(index, { playing: false, error: 'This track could not be played on this device.' }),
        );
      });
      audio.current = { context, elements, channels, sides };
    }
    if (audio.current.context.state === 'suspended') {
      audio.current.context.resume().catch(() => {
        // The next tap tries again; nothing plays until then, which the deck shows.
      });
    }
    return audio.current;
  }, [patchDeck]);

  /** Loads a track on a deck, with its analysis (worked out here the first time, then kept by the library). */
  const load = useCallback(
    async (index, track) => {
      const element = graph().elements[index];
      const rate = 1 + decksRef.current[index].pitch / 100;
      element.pause();
      element.src = api.trackAudioUrl(track.id);
      // Loading a new source resets the speed to the default one, so set both.
      element.defaultPlaybackRate = rate;
      element.playbackRate = rate;
      patchDeck(index, { track, analysis: null, isAnalysing: true, playing: false, cue: 0, error: null });
      const isStillLoaded = (deck) => deck.track?.id === track.id;
      try {
        const saved = (await api.getTrackAnalysis(track.id)).analysis;
        const analysis = saved ?? (await analyseTrack(track.id));
        if (!saved) {
          api.saveTrackAnalysis(track.id, analysis).catch(() => {
            // Only a cache: the track is analysed again next time.
          });
        }
        patchDeck(index, (deck) => (isStillLoaded(deck) ? { analysis, isAnalysing: false } : {}));
      } catch (error) {
        patchDeck(index, (deck) =>
          isStillLoaded(deck) ? { isAnalysing: false, error: `No beat for the lights: ${error.message}` } : {},
        );
      }
    },
    [graph, patchDeck],
  );

  const play = useCallback(
    (index) => {
      graph()
        .elements[index].play()
        .catch((error) => patchDeck(index, { error: `Could not play: ${error.message}` }));
    },
    [graph, patchDeck],
  );

  const pause = useCallback((index) => {
    audio.current?.elements[index].pause();
  }, []);

  /** Cue, as on a CDJ: while playing, back to the cue point and stop; while stopped, set the cue point here. */
  const cue = useCallback(
    (index) => {
      const element = audio.current?.elements[index];
      if (!element) {
        return;
      }
      if (element.paused) {
        patchDeck(index, { cue: element.currentTime });
      } else {
        element.pause();
        element.currentTime = decksRef.current[index].cue;
      }
    },
    [patchDeck],
  );

  const seek = useCallback((index, seconds) => {
    const element = audio.current?.elements[index];
    if (element && Number.isFinite(seconds)) {
      element.currentTime = Math.max(0, seconds);
    }
  }, []);

  const setPitch = useCallback(
    (index, pitch) => {
      const value = Math.max(-PITCH_RANGE, Math.min(PITCH_RANGE, pitch));
      patchDeck(index, { pitch: value });
      const element = audio.current?.elements[index];
      if (element) {
        element.defaultPlaybackRate = 1 + value / 100;
        element.playbackRate = 1 + value / 100;
      }
    },
    [patchDeck],
  );

  const setVolume = useCallback(
    (index, volume) => {
      const value = Math.max(0, Math.min(1, volume));
      patchDeck(index, { volume: value });
      if (audio.current) {
        audio.current.channels[index].gain.value = value;
      }
    },
    [patchDeck],
  );

  const setCrossfader = useCallback((value) => {
    const next = Math.max(-1, Math.min(1, value));
    setCrossfaderState(next);
    if (audio.current) {
      const [a, b] = crossfadeGains(next);
      audio.current.sides[0].gain.value = a;
      audio.current.sides[1].gain.value = b;
    }
  }, []);

  /** Matches a deck's tempo to the other deck's. */
  const sync = useCallback(
    (index) => {
      const mine = decksRef.current[index];
      const other = decksRef.current[1 - index];
      if (mine.analysis && other.analysis) {
        setPitch(index, pitchToMatch(mine.analysis.bpm, other.analysis.bpm * (1 + other.pitch / 100)));
      }
    },
    [setPitch],
  );

  /** Where a deck is, in seconds, read live (for animation, without re-rendering). */
  const positionOf = useCallback((index) => audio.current?.elements[index].currentTime ?? 0, []);

  useBeatLock({ decksRef, crossfaderRef, elementOf: (index) => audio.current?.elements[index], sendRef });

  // Stop the music when the app closes.
  useEffect(
    () => () => {
      audio.current?.elements.forEach((element) => element.pause());
      audio.current?.context.close().catch(() => {
        // Already closed.
      });
    },
    [],
  );

  return {
    library,
    libraryError,
    refreshLibrary,
    setFolder,
    decks,
    crossfader,
    load,
    play,
    pause,
    cue,
    seek,
    setPitch,
    setVolume,
    setCrossfader,
    sync,
    positionOf,
  };
}

/** @typedef {ReturnType<typeof useDeckEngine>} Decks */

const DecksContext = createContext(/** @type {Decks | null} */ (null));

/**
 * Holds the decks for the whole app.
 * @param {{ send: (message: object) => void, children?: import('react').ReactNode }} props
 */
export function DecksProvider({ send, children }) {
  return createElement(DecksContext.Provider, { value: useDeckEngine({ send }) }, children);
}

/** @returns {Decks} */
export function useDecks() {
  const value = useContext(DecksContext);
  if (!value) {
    throw new Error('useDecks needs a DecksProvider above it');
  }
  return value;
}
