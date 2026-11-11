// The lighting engine: layers a scene (with crossfades and chases) under a live programmer,
// applies master and blackout to level channels, and pushes one 512-slot frame per tick to a driver.
import { MAX_BPM, MIN_BPM, pulseGain, rainbowRgb, sweepGain } from '../../shared/effects.js';
import { DMX_CHANNELS } from '../../shared/patch.js';

/** @typedef {import('../../shared/types.js').Driver} Driver */
/** @typedef {import('../../shared/types.js').Scene} Scene */
/** @typedef {import('../../shared/types.js').Chase} Chase */
/** @typedef {import('../../shared/patch.js').FixtureChannels} FixtureChannels */
/** @typedef {{ type: 'pulse' | 'sweep' | 'rainbow', beats: number, groupId: string | null, fixtureIds: string[] | null }} Effect */
/** @typedef {{ from: Float64Array, to: Float64Array, start: number, duration: number }} Fade */
/**
 * @typedef {object} ChaseRun
 * @property {string} id
 * @property {boolean} loop
 * @property {Chase['steps']} steps only the steps whose look still exists
 * @property {Map<string, Scene>} scenesById
 * @property {'seconds' | 'beats'} timing
 * @property {number} fadeMs this step's fade in milliseconds, worked out when the step begins (beats use the tempo then)
 * @property {number} holdMs this step's hold in milliseconds
 * @property {number} index current step
 * @property {'fade' | 'hold'} phase
 * @property {number} phaseStart milliseconds on the engine clock
 */
/** @typedef {{ master: number, blackout: boolean, bpm: number, effect: { type: string, beats: number, groupId: string | null } | null, activeSceneId: string | null, activeChaseId: string | null, chaseStep: number | null, programmerChannels: number[] }} EngineState */
/** @typedef {{ type: 'frame', frame: Uint8Array } | { type: 'state', state: EngineState }} EngineEvent */

export class DmxEngine {
  /**
   * @param {{ driver: Driver, frameRate?: number, now?: () => number }} options `now` is injectable so tests can
   *   drive time deterministically.
   */
  constructor({ driver, frameRate = 30, now = () => Date.now() }) {
    this.driver = driver;
    this.frameRate = frameRate;
    this.now = now;
    /** @type {ReturnType<typeof setInterval> | null} */
    this.timer = null;
    /** @type {Set<(event: EngineEvent) => void>} */
    this.listeners = new Set();

    this.sceneLayer = new Float64Array(DMX_CHANNELS);
    /** The value each channel sits at when a look does not set it: a pan at the centre, a dimmer open. */
    this.restingLayer = new Float64Array(DMX_CHANNELS);
    /** @type {Map<number, number>} manual (programmer) values by 1-based channel */
    this.programmer = new Map();
    /** @type {Set<number>} channels that master and blackout scale (brightness, not position) */
    this.levelChannels = new Set();
    this.master = 1;
    this.blackout = false;
    /** @type {string | null} */
    this.activeSceneId = null;
    /** @type {Fade | null} */
    this.fade = null;
    /** @type {ChaseRun | null} */
    this.chase = null;
    this.frame = new Uint8Array(DMX_CHANNELS);

    this.bpm = 120;
    this.tempoOrigin = 0; // the engine-clock time of beat 0; effects and beat-timed sequences measure from here
    /** @type {Effect | null} */
    this.effect = null;
    /** @type {Map<string, FixtureChannels>} */
    this.fixtureChannels = new Map();
  }

  /** @returns {number} milliseconds in one beat at the current tempo */
  beatMs() {
    return 60000 / this.bpm;
  }

  /**
   * Sets the tempo. The beat position carries on from where it was, so an effect does not jump when the tempo changes,
   * unless `sync` says this moment is a beat (tapping the tempo on the beat).
   * @param {number} bpm
   * @param {boolean} [sync]
   * @param {number} [at]
   */
  setTempo(bpm, sync = false, at = this.now()) {
    const beat = (at - this.tempoOrigin) / this.beatMs();
    this.bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
    this.tempoOrigin = sync ? at : at - beat * this.beatMs();
    this.emitState();
  }

  /** @param {Map<string, FixtureChannels>} fixtureChannels the colour and brightness channels of every fixture */
  setFixtureChannels(fixtureChannels) {
    this.fixtureChannels = fixtureChannels;
  }

  /**
   * Starts a live effect. It lies over the current look, under the manual changes, and follows the tempo.
   * @param {Effect} effect `fixtureIds` null means every fixture
   */
  startEffect(effect) {
    this.effect = effect;
    this.emitState();
  }

  stopEffect() {
    if (this.effect) {
      this.effect = null;
      this.emitState();
    }
  }

  /** Swaps the output driver at runtime; the caller closes the old one. @param {Driver} driver */
  setDriver(driver) {
    this.driver = driver;
  }

  /**
   * Sets the values channels rest at. Until a look or sequence takes over, the lights sit there, and a look that does not
   * mention a channel returns it there instead of to 0 (which would send a pan or tilt to a corner).
   * @param {Map<number, number>} resting value by 1-based channel, for channels that rest above 0
   */
  setRestingValues(resting) {
    this.restingLayer = new Float64Array(DMX_CHANNELS);
    for (const [channel, value] of resting) {
      this.restingLayer[channel - 1] = value;
    }
    if (this.activeSceneId === null && !this.chase && !this.fade) {
      this.sceneLayer = Float64Array.from(this.restingLayer);
    }
  }

  /** @param {Set<number>} levelChannels */
  setLevelChannels(levelChannels) {
    this.levelChannels = levelChannels;
  }

  /** @param {Record<string, number>} values 0-255 by 1-based channel number */
  setProgrammer(values) {
    for (const [channel, value] of Object.entries(values)) {
      this.programmer.set(Number(channel), value);
    }
    this.emitState();
  }

  clearProgrammer() {
    this.programmer.clear();
    this.emitState();
  }

  /** @param {number} level 0 to 1 */
  setMaster(level) {
    this.master = Math.max(0, Math.min(1, level));
    this.emitState();
  }

  /** @param {boolean} enabled */
  setBlackout(enabled) {
    this.blackout = enabled;
    this.emitState();
  }

  /**
   * Playing a look or sequence takes over from any manual changes, otherwise the manual layer would hide it.
   * @param {Scene} scene
   * @param {number} [fadeMs]
   */
  recallScene(scene, fadeMs = 0) {
    this.stopChase();
    this.programmer.clear();
    this.activeSceneId = scene.id;
    this.startFade(scene.values, fadeMs);
    this.emitState();
  }

  /**
   * Starts a sequence, skipping steps whose look no longer exists. Takes over from manual changes.
   * @param {Chase} chase
   * @param {Map<string, Scene>} scenesById
   * @returns {boolean} false when none of its looks exist, so nothing started
   */
  startChase(chase, scenesById) {
    const steps = chase.steps.filter((step) => scenesById.has(step.sceneId));
    if (steps.length === 0) {
      return false;
    }
    this.programmer.clear();
    /** @type {ChaseRun} */
    const run = {
      id: chase.id,
      loop: chase.loop,
      timing: chase.timing ?? 'seconds',
      fadeMs: 0,
      holdMs: 0,
      steps,
      scenesById,
      index: 0,
      phase: 'fade',
      phaseStart: 0,
    };
    this.chase = run;
    this.activeSceneId = null;
    this.beginChaseStep(run, this.now());
    this.emitState();
    return true;
  }

  stopChase() {
    if (this.chase) {
      this.chase = null;
      this.emitState();
    }
  }

  /**
   * Takes the look (or sequence) off stage: the lights fade back to where they rest, as before anything was played.
   * Manual changes and a running effect are separate layers with their own stop, so they stay.
   * @param {number} [fadeMs]
   */
  releaseScene(fadeMs = 0) {
    this.chase = null;
    this.activeSceneId = null;
    this.startFade({}, fadeMs);
    this.emitState();
  }

  /**
   * @param {ChaseRun} run
   * @param {number} at milliseconds on the engine clock
   */
  beginChaseStep(run, at) {
    const step = run.steps[run.index];
    const scene = run.scenesById.get(step.sceneId);
    run.phase = 'fade';
    run.phaseStart = at;
    if (run.timing === 'beats') {
      run.fadeMs = Math.round((step.fadeBeats ?? 0) * this.beatMs());
      run.holdMs = Math.round((step.holdBeats ?? 1) * this.beatMs());
    } else {
      run.fadeMs = step.fadeMs;
      run.holdMs = step.holdMs;
    }
    this.activeSceneId = step.sceneId;
    this.startFade(scene?.values ?? {}, run.fadeMs, at);
  }

  /**
   * @param {Record<string, number>} values target level by 1-based channel number
   * @param {number} durationMs 0 for an instant change
   * @param {number} [at]
   */
  startFade(values, durationMs, at = this.now()) {
    const target = Float64Array.from(this.restingLayer);
    for (const [channel, value] of Object.entries(values)) {
      target[Number(channel) - 1] = value;
    }
    if (durationMs <= 0) {
      this.sceneLayer = target;
      this.fade = null;
      return;
    }
    this.fade = { from: Float64Array.from(this.sceneLayer), to: target, start: at, duration: durationMs };
  }

  /** @param {number} at */
  advance(at) {
    const fade = this.fade;
    if (fade) {
      const progress = Math.min(1, (at - fade.start) / fade.duration);
      for (let i = 0; i < DMX_CHANNELS; i += 1) {
        this.sceneLayer[i] = fade.from[i] + (fade.to[i] - fade.from[i]) * progress;
      }
      if (progress >= 1) {
        this.fade = null;
      }
    }
    if (this.chase) {
      this.advanceChase(this.chase, at);
    }
  }

  /**
   * @param {ChaseRun} run
   * @param {number} at
   */
  advanceChase(run, at) {
    if (run.phase === 'fade' && !this.fade) {
      run.phase = 'hold';
      run.phaseStart += run.fadeMs;
    }
    if (run.phase === 'hold' && at - run.phaseStart >= run.holdMs) {
      const isLast = run.index === run.steps.length - 1;
      if (isLast && !run.loop) {
        this.chase = null;
        this.emitState();
        return;
      }
      run.index = isLast ? 0 : run.index + 1;
      this.beginChaseStep(run, at);
      this.emitState();
    }
  }

  /**
   * Composes the next frame and sends it to the driver. Exposed so tests can drive time deterministically.
   * @param {number} [at]
   * @returns {Uint8Array}
   */
  tick(at = this.now()) {
    this.advance(at);
    const frame = this.frame;
    for (let i = 0; i < DMX_CHANNELS; i += 1) {
      frame[i] = Math.round(this.sceneLayer[i]);
    }
    if (this.effect) {
      this.applyEffect(frame, this.effect, at);
    }
    for (const [channel, value] of this.programmer) {
      frame[channel - 1] = value;
    }
    const scale = this.blackout ? 0 : this.master;
    if (scale < 1) {
      for (const channel of this.levelChannels) {
        frame[channel - 1] = Math.round(frame[channel - 1] * scale);
      }
    }
    this.driver.send(frame);
    for (const listener of this.listeners) {
      listener({ type: 'frame', frame });
    }
    return frame;
  }

  /**
   * Lays the running effect over the frame. Pulse and sweep scale a fixture's brightness channels; rainbow sets its red,
   * green and blue. Fixtures that are not in the rig any more are skipped.
   * @param {Uint8Array} frame
   * @param {Effect} effect
   * @param {number} at
   */
  applyEffect(frame, effect, at) {
    const ids = (effect.fixtureIds ?? [...this.fixtureChannels.keys()]).filter((id) => this.fixtureChannels.has(id));
    const phase = (((at - this.tempoOrigin) / this.beatMs()) % effect.beats) / effect.beats;
    const wrapped = phase < 0 ? phase + 1 : phase;
    ids.forEach((id, index) => {
      const channels = /** @type {FixtureChannels} */ (this.fixtureChannels.get(id));
      if (effect.type === 'rainbow') {
        const [red, green, blue] = rainbowRgb(wrapped, index, ids.length);
        if (channels.red !== undefined) {
          frame[channels.red - 1] = red;
        }
        if (channels.green !== undefined) {
          frame[channels.green - 1] = green;
        }
        if (channels.blue !== undefined) {
          frame[channels.blue - 1] = blue;
        }
        return;
      }
      const gain = effect.type === 'pulse' ? pulseGain(wrapped) : sweepGain(wrapped, index, ids.length);
      for (const channel of channels.levels) {
        frame[channel - 1] = Math.round(frame[channel - 1] * gain);
      }
    });
  }

  /** @returns {EngineState} */
  getState() {
    return {
      master: this.master,
      blackout: this.blackout,
      bpm: this.bpm,
      effect: this.effect ? { type: this.effect.type, beats: this.effect.beats, groupId: this.effect.groupId } : null,
      activeSceneId: this.activeSceneId,
      activeChaseId: this.chase?.id ?? null,
      chaseStep: this.chase?.index ?? null,
      programmerChannels: [...this.programmer.keys()],
    };
  }

  emitState() {
    for (const listener of this.listeners) {
      listener({ type: 'state', state: this.getState() });
    }
  }

  /**
   * @param {(event: EngineEvent) => void} listener
   * @returns {() => void} call to stop listening
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => this.tick(), Math.round(1000 / this.frameRate));
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = null;
    this.driver.send(new Uint8Array(DMX_CHANNELS));
    await this.driver.close();
  }
}
