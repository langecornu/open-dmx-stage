// Tests for the plain-words description of what is on stage.
import { describe, expect, it } from 'vitest';

import { describeStage } from '../../src/utils/stageStatus.js';

const project = {
  scenes: [{ id: 's1', name: 'Ocean' }],
  chases: [{ id: 'c1', name: 'Colour cycle', loop: true, steps: [{}, {}, {}] }],
  groups: [{ id: 'g1', name: 'Front pars' }],
};
const idle = {
  master: 1,
  blackout: false,
  bpm: 120,
  effect: null,
  activeSceneId: null,
  activeChaseId: null,
  chaseStep: null,
  programmerChannels: [],
};

describe('describeStage', () => {
  it('says nothing is playing when the stage is at rest', () => {
    const stage = describeStage(idle, project);
    expect(stage).toMatchObject({ kind: 'idle', title: 'Nothing playing', action: null, layers: [] });
  });

  it('names the auto show and what it is playing, ahead of its sequence, and offers Stop', () => {
    const auto = { source: 'sequences', beats: 8, order: 'shuffle', itemId: 'c1' };
    const stage = describeStage({ ...idle, auto, activeChaseId: 'c1', chaseStep: 0 }, project);
    expect(stage).toMatchObject({
      kind: 'auto',
      title: 'Auto show: Colour cycle',
      detail: 'Sequences · shuffled · changes every 2 bars',
    });
    expect(stage.action).toEqual({ label: 'Stop', message: { type: 'autoStop' } });
  });

  it('names the playing sequence, its step, and offers Stop', () => {
    const stage = describeStage({ ...idle, activeChaseId: 'c1', chaseStep: 1 }, project);
    expect(stage.kind).toBe('sequence');
    expect(stage.title).toBe('Colour cycle');
    expect(stage.detail).toBe('Sequence · Step 2 of 3 · looping');
    expect(stage.action).toEqual({ label: 'Stop', message: { type: 'chaseStop' } });
    expect(stage.view).toBe('chases');
  });

  it('names the active look without a stop action', () => {
    const stage = describeStage({ ...idle, activeSceneId: 's1' }, project);
    expect(stage).toMatchObject({ kind: 'look', title: 'Ocean', action: null, view: 'scenes' });
  });

  it('puts blackout first and offers to bring the lights back', () => {
    const stage = describeStage({ ...idle, blackout: true, activeChaseId: 'c1', chaseStep: 0 }, project);
    expect(stage.kind).toBe('blackout');
    expect(stage.action).toEqual({ label: 'Lights on', message: { type: 'blackout', enabled: false } });
  });

  it('describes manual changes and offers a reset', () => {
    const stage = describeStage({ ...idle, programmerChannels: [1, 2] }, project);
    expect(stage).toMatchObject({ kind: 'manual', detail: 'Set by hand on 2 channels' });
    expect(stage.action.message).toEqual({ type: 'clearProgrammer' });
    expect(describeStage({ ...idle, programmerChannels: [1] }, project).detail).toBe('Set by hand on 1 channel');
  });

  it('lists an effect and manual changes as layers underneath the main thing', () => {
    const stage = describeStage(
      {
        ...idle,
        activeSceneId: 's1',
        effect: { type: 'pulse', beats: 4, groupId: 'g1' },
        programmerChannels: [3],
      },
      project,
    );
    expect(stage.layers.map((layer) => layer.text)).toEqual([
      'Pulse effect on Front pars',
      'Manual changes on 1 channel',
    ]);
    expect(stage.layers[0].action.message).toEqual({ type: 'effectStop' });
  });

  it('says all lights when an effect has no group, and survives a deleted sequence', () => {
    const stage = describeStage({ ...idle, effect: { type: 'rainbow', beats: 8, groupId: null } }, project);
    expect(stage.layers[0].text).toBe('Rainbow effect on all lights');
    expect(describeStage({ ...idle, activeChaseId: 'gone', chaseStep: null }, project).title).toBe('A sequence');
  });
});
