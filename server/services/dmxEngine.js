// The lighting engine: layers a scene (with crossfades and chases) under a live programmer,
// applies master and blackout to level channels, and pushes one 512-slot frame per tick to a driver.
import { DMX_CHANNELS } from '../../shared/patch.js';

export class DmxEngine {
  constructor({ driver, frameRate = 30, now = () => Date.now() }) {
    this.driver = driver;
    this.frameRate = frameRate;
    this.now = now;
    this.timer = null;
    this.listeners = new Set();

    this.sceneLayer = new Float64Array(DMX_CHANNELS);
    this.programmer = new Map();
    this.levelChannels = new Set();
    this.master = 1;
    this.blackout = false;
    this.activeSceneId = null;
    this.fade = null;
    this.chase = null;
    this.frame = new Uint8Array(DMX_CHANNELS);
  }

  setLevelChannels(levelChannels) {
    this.levelChannels = levelChannels;
  }

  // channel is 1-based, value 0-255.
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

  setMaster(level) {
    this.master = Math.max(0, Math.min(1, level));
    this.emitState();
  }

  setBlackout(enabled) {
    this.blackout = enabled;
    this.emitState();
  }

  recallScene(scene, fadeMs = 0) {
    this.stopChase();
    this.activeSceneId = scene.id;
    this.startFade(scene.values, fadeMs);
    this.emitState();
  }

  startChase(chase, scenesById) {
    const steps = chase.steps.filter((step) => scenesById.has(step.sceneId));
    if (steps.length === 0) {
      return false;
    }
    this.chase = { id: chase.id, loop: chase.loop, steps, scenesById, index: 0, phase: 'fade', phaseStart: 0 };
    this.activeSceneId = null;
    this.beginChaseStep(this.now());
    this.emitState();
    return true;
  }

  stopChase() {
    if (this.chase) {
      this.chase = null;
      this.emitState();
    }
  }

  beginChaseStep(at) {
    const step = this.chase.steps[this.chase.index];
    this.chase.phase = 'fade';
    this.chase.phaseStart = at;
    this.activeSceneId = step.sceneId;
    this.startFade(this.chase.scenesById.get(step.sceneId).values, step.fadeMs, at);
  }

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

  advance(at) {
    if (this.fade) {
      const progress = Math.min(1, (at - this.fade.start) / this.fade.duration);
      for (let i = 0; i < DMX_CHANNELS; i += 1) {
        this.sceneLayer[i] = this.fade.from[i] + (this.fade.to[i] - this.fade.from[i]) * progress;
      }
      if (progress >= 1) {
        this.fade = null;
      }
    }
    if (this.chase) {
      this.advanceChase(at);
    }
  }

  advanceChase(at) {
    const chase = this.chase;
    const step = chase.steps[chase.index];
    if (chase.phase === 'fade' && !this.fade) {
      chase.phase = 'hold';
      chase.phaseStart += step.fadeMs;
    }
    if (chase.phase === 'hold' && at - chase.phaseStart >= step.holdMs) {
      const isLast = chase.index === chase.steps.length - 1;
      if (isLast && !chase.loop) {
        this.chase = null;
        this.emitState();
        return;
      }
      chase.index = isLast ? 0 : chase.index + 1;
      this.beginChaseStep(at);
      this.emitState();
    }
  }

  // Composes the next frame. Exposed so tests can drive time deterministically.
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
    clearInterval(this.timer);
    this.timer = null;
    this.driver.send(new Uint8Array(DMX_CHANNELS));
    await this.driver.close();
  }
}
