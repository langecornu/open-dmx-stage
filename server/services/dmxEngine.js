// The lighting engine: layers a scene (with crossfades and chases) under a live programmer,
// applies master and blackout to level channels, and pushes one 512-slot frame per tick to a driver.
import { DMX_CHANNELS } from '../../shared/patch.js';

/** @typedef {import('../../shared/types.js').Driver} Driver */
/** @typedef {import('../../shared/types.js').Scene} Scene */
/** @typedef {import('../../shared/types.js').Chase} Chase */
/** @typedef {{ from: Float64Array, to: Float64Array, start: number, duration: number }} Fade */
/**
 * @typedef {object} ChaseRun
 * @property {string} id
 * @property {boolean} loop
 * @property {Chase['steps']} steps only the steps whose look still exists
 * @property {Map<string, Scene>} scenesById
 * @property {number} index current step
 * @property {'fade' | 'hold'} phase
 * @property {number} phaseStart milliseconds on the engine clock
 */
/** @typedef {{ master: number, blackout: boolean, activeSceneId: string | null, activeChaseId: string | null, chaseStep: number | null, programmerChannels: number[] }} EngineState */
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
  }

  /** Swaps the output driver at runtime; the caller closes the old one. @param {Driver} driver */
  setDriver(driver) {
    this.driver = driver;
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
    const run = { id: chase.id, loop: chase.loop, steps, scenesById, index: 0, phase: 'fade', phaseStart: 0 };
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
   * @param {ChaseRun} run
   * @param {number} at milliseconds on the engine clock
   */
  beginChaseStep(run, at) {
    const step = run.steps[run.index];
    const scene = run.scenesById.get(step.sceneId);
    run.phase = 'fade';
    run.phaseStart = at;
    this.activeSceneId = step.sceneId;
    this.startFade(scene?.values ?? {}, step.fadeMs, at);
  }

  /**
   * @param {Record<string, number>} values target level by 1-based channel number
   * @param {number} durationMs 0 for an instant change
   * @param {number} [at]
   */
  startFade(values, durationMs, at = this.now()) {
    const target = new Float64Array(DMX_CHANNELS);
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
    const step = run.steps[run.index];
    if (run.phase === 'fade' && !this.fade) {
      run.phase = 'hold';
      run.phaseStart += step.fadeMs;
    }
    if (run.phase === 'hold' && at - run.phaseStart >= step.holdMs) {
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

  /** @returns {EngineState} */
  getState() {
    return {
      master: this.master,
      blackout: this.blackout,
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
