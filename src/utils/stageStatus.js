// Turns the live engine state into plain words for the "on stage" bar: what is playing, where it came from, and what
// the one obvious action is. Pure, so every wording is easy to test.

import { summariseMuteSolo } from './muteSolo.js';

const EFFECT_NAMES = { pulse: 'Pulse', sweep: 'Sweep', rainbow: 'Rainbow' };

/**
 * @typedef {{ label: string, message: object }} StageAction a button label and the live message it sends
 * @typedef {{ id: string, text: string, action: StageAction | null }} StageLayer something also running underneath
 * @typedef {{
 *   kind: 'blackout' | 'sequence' | 'look' | 'manual' | 'idle',
 *   title: string,
 *   detail: string,
 *   view: string | null,
 *   action: StageAction | null,
 *   layers: StageLayer[],
 * }} StageStatus
 */

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function effectLayer(engine, project) {
  if (!engine.effect) {
    return null;
  }
  const name = EFFECT_NAMES[engine.effect.type] ?? engine.effect.type;
  const group = engine.effect.groupId ? project.groups.find((item) => item.id === engine.effect.groupId) : null;
  return {
    id: 'effect',
    text: `${name} effect on ${group ? group.name : 'all lights'}`,
    action: { label: 'Stop effect', message: { type: 'effectStop' } },
  };
}

function manualLayer(engine) {
  if (engine.programmerChannels.length === 0) {
    return null;
  }
  return {
    id: 'manual',
    text: `Manual changes on ${plural(engine.programmerChannels.length, 'channel')}`,
    action: { label: 'Reset', message: { type: 'clearProgrammer' } },
  };
}

// Muted or soloed lights stay dark whatever plays, so the bar always says so and offers to clear it.
function muteSoloLayer(engine, project) {
  const text = summariseMuteSolo(project.fixtures ?? [], engine);
  return text ? { id: 'mutesolo', text, action: { label: 'Clear', message: { type: 'clearMuteSolo' } } } : null;
}

/**
 * @param {import('../hooks/useLive.js').EngineState} engine
 * @param {{ scenes: { id: string, name: string }[], chases: { id: string, name: string, loop: boolean, steps: unknown[] }[], groups: { id: string, name: string }[], fixtures?: { id: string, name: string }[] }} project
 * @returns {StageStatus}
 */
export function describeStage(engine, project) {
  const layers = [effectLayer(engine, project), manualLayer(engine), muteSoloLayer(engine, project)].filter(Boolean);
  const withoutLayer = (id) => layers.filter((layer) => layer.id !== id);

  if (engine.blackout) {
    return {
      kind: 'blackout',
      title: 'Blackout',
      detail: 'The lights are off. Everything else keeps running underneath.',
      view: null,
      action: { label: 'Lights on', message: { type: 'blackout', enabled: false } },
      layers: [],
    };
  }

  if (engine.activeChaseId) {
    const chase = project.chases.find((item) => item.id === engine.activeChaseId);
    const total = chase?.steps.length ?? 0;
    const step = engine.chaseStep === null ? '' : `Step ${engine.chaseStep + 1} of ${total}`;
    const loop = chase?.loop ? 'looping' : 'plays once';
    return {
      kind: 'sequence',
      title: chase?.name ?? 'A sequence',
      detail: ['Sequence', step, loop].filter(Boolean).join(' · '),
      view: 'chases',
      action: { label: 'Stop', message: { type: 'chaseStop' } },
      layers,
    };
  }

  if (engine.activeSceneId) {
    const scene = project.scenes.find((item) => item.id === engine.activeSceneId);
    return {
      kind: 'look',
      title: scene?.name ?? 'A look',
      detail: 'Look · stays on until you stop it or pick something else',
      view: 'scenes',
      action: { label: 'Stop', message: { type: 'release' } },
      layers,
    };
  }

  if (engine.programmerChannels.length > 0) {
    return {
      kind: 'manual',
      title: 'Manual colours',
      detail: `Set by hand on ${plural(engine.programmerChannels.length, 'channel')}`,
      view: 'control',
      action: { label: 'Reset', message: { type: 'clearProgrammer' } },
      layers: withoutLayer('manual'),
    };
  }

  return {
    kind: 'idle',
    title: 'Nothing playing',
    detail: 'Pick a look or start a sequence.',
    view: null,
    action: null,
    layers,
  };
}
