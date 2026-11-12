// Tests for the commands in the search palette: what can be done now, and how a typed search ranks them.
import { describe, expect, it, vi } from 'vitest';

import { buildCommands, filterCommands } from '../../src/utils/commands.js';

const project = {
  scenes: [
    { id: 's1', name: 'Ocean' },
    { id: 's2', name: 'Sunset' },
  ],
  chases: [{ id: 'c1', name: 'Colour cycle', steps: [{}, {}] }],
};
const idle = { blackout: false, effect: null, activeSceneId: null, activeChaseId: null, programmerChannels: [] };

function context() {
  return {
    send: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn(),
    toggleTheme: vi.fn(),
    showShortcuts: vi.fn(),
  };
}
const find = (commands, id) => commands.find((command) => command.id === id);

describe('buildCommands', () => {
  it('offers every screen, every look and every sequence', () => {
    const commands = buildCommands({ project, engine: idle, theme: 'dark' });
    expect(commands.filter((command) => command.group === 'Go to')).toHaveLength(8);
    expect(find(commands, 'look-s1').label).toBe('Play Ocean');
    expect(find(commands, 'sequence-c1').label).toBe('Start Colour cycle');
    expect(find(commands, 'sequence-c1').hint).toBe('Sequence · 2 steps');
  });

  it('only offers to stop, end an effect or reset when there is something to stop', () => {
    const idleIds = buildCommands({ project, engine: idle, theme: 'dark' }).map((command) => command.id);
    expect(idleIds).not.toContain('action-stop');
    expect(idleIds).not.toContain('action-stop-effect');
    expect(idleIds).not.toContain('action-reset');
    const busy = buildCommands({
      project,
      engine: { ...idle, activeChaseId: 'c1', effect: { type: 'pulse' }, programmerChannels: [1] },
      theme: 'dark',
    }).map((command) => command.id);
    expect(busy).toEqual(expect.arrayContaining(['action-stop', 'action-stop-effect', 'action-reset']));
    expect(busy).not.toContain('action-release');
  });

  it('offers to stop a look that stays on stage after a sequence or a recall', async () => {
    const ctx = context();
    const commands = buildCommands({ project, engine: { ...idle, activeSceneId: 's1' }, theme: 'dark' });
    expect(find(commands, 'action-stop')).toBeUndefined();
    await find(commands, 'action-release').run(ctx);
    expect(ctx.send).toHaveBeenLastCalledWith({ type: 'release' });
  });

  it('starts the auto show after saving, and stops it while it runs', async () => {
    const ctx = context();
    const start = find(buildCommands({ project, engine: idle, theme: 'dark' }), 'action-auto');
    expect(start.label).toBe('Start the auto show');
    await start.run(ctx);
    expect(ctx.flush).toHaveBeenCalled();
    expect(ctx.send).toHaveBeenLastCalledWith({ type: 'autoStart', source: 'looks', beats: 8, order: 'order' });

    const running = { ...idle, auto: { source: 'looks', beats: 8, order: 'order', itemId: 's1' } };
    const stop = find(buildCommands({ project, engine: running, theme: 'dark' }), 'action-auto');
    expect(stop.label).toBe('Stop the auto show');
    await stop.run(ctx);
    expect(ctx.send).toHaveBeenLastCalledWith({ type: 'autoStop' });
  });

  it('starts a sequence drawn on the timeline after saving, and stops it while it plays', async () => {
    const ctx = context();
    const groove = { id: 't1', name: 'Groove', loop: true, timing: 'beats', steps: [], blocks: [{ id: 'b' }] };
    const withTimeline = { ...project, chases: [...project.chases, groove] };
    const start = find(buildCommands({ project: withTimeline, engine: idle, theme: 'dark' }), 'sequence-t1');
    expect(start.label).toBe('Start Groove');
    await start.run(ctx);
    expect(ctx.flush).toHaveBeenCalled();
    expect(ctx.send).toHaveBeenLastCalledWith({ type: 'chaseStart', chaseId: 't1' });
    const playing = { ...idle, activeChaseId: 't1' };
    const stop = find(buildCommands({ project: withTimeline, engine: playing, theme: 'dark' }), 'sequence-t1');
    expect(stop.label).toBe('Stop Groove');
    await stop.run(ctx);
    expect(ctx.send).toHaveBeenLastCalledWith({ type: 'chaseStop' });
  });

  it('does not offer the auto show when there are no looks', () => {
    const empty = { ...project, scenes: [] };
    expect(find(buildCommands({ project: empty, engine: idle, theme: 'dark' }), 'action-auto')).toBeUndefined();
  });

  it('offers to clear mute and solo only while a light is muted or soloed', async () => {
    const ctx = context();
    expect(find(buildCommands({ project, engine: idle, theme: 'dark' }), 'action-clear-mute-solo')).toBeUndefined();
    const command = find(
      buildCommands({ project, engine: { ...idle, muted: [], soloed: ['a'] }, theme: 'dark' }),
      'action-clear-mute-solo',
    );
    await command.run(ctx);
    expect(ctx.send).toHaveBeenLastCalledWith({ type: 'clearMuteSolo' });
  });

  it('plays a look after saving any pending edit, with a short fade', async () => {
    const ctx = context();
    await find(buildCommands({ project, engine: idle, theme: 'dark' }), 'look-s2').run(ctx);
    expect(ctx.flush).toHaveBeenCalled();
    expect(ctx.send).toHaveBeenCalledWith({ type: 'recall', sceneId: 's2', fadeMs: 500 });
  });

  it('starts a sequence, and the same command stops it while it plays', async () => {
    const ctx = context();
    await find(buildCommands({ project, engine: idle, theme: 'dark' }), 'sequence-c1').run(ctx);
    expect(ctx.send).toHaveBeenLastCalledWith({ type: 'chaseStart', chaseId: 'c1' });
    const playing = find(
      buildCommands({ project, engine: { ...idle, activeChaseId: 'c1' }, theme: 'dark' }),
      'sequence-c1',
    );
    expect(playing.label).toBe('Stop Colour cycle');
    await playing.run(ctx);
    expect(ctx.send).toHaveBeenLastCalledWith({ type: 'chaseStop' });
  });

  it('toggles blackout either way and says which it will do', () => {
    const ctx = context();
    const off = find(buildCommands({ project, engine: idle, theme: 'dark' }), 'action-blackout');
    expect(off.label).toBe('Blackout');
    off.run(ctx);
    expect(ctx.send).toHaveBeenLastCalledWith({ type: 'blackout', enabled: true });
    const on = find(buildCommands({ project, engine: { ...idle, blackout: true }, theme: 'dark' }), 'action-blackout');
    expect(on.label).toMatch(/Lights on/);
    on.run(ctx);
    expect(ctx.send).toHaveBeenLastCalledWith({ type: 'blackout', enabled: false });
  });

  it('opens the keyboard shortcuts', () => {
    const ctx = context();
    find(buildCommands({ project, engine: idle, theme: 'dark' }), 'action-shortcuts').run(ctx);
    expect(ctx.showShortcuts).toHaveBeenCalled();
  });

  it('goes to a screen and switches the theme', () => {
    const ctx = context();
    const commands = buildCommands({ project, engine: idle, theme: 'light' });
    find(commands, 'go-perform').run(ctx);
    expect(ctx.navigate).toHaveBeenCalledWith('perform');
    const theme = find(commands, 'action-theme');
    expect(theme.label).toBe('Switch to the dark theme');
    theme.run(ctx);
    expect(ctx.toggleTheme).toHaveBeenCalled();
  });
});

describe('filterCommands', () => {
  const commands = buildCommands({ project, engine: idle, theme: 'dark' });

  it('returns everything for an empty search', () => {
    expect(filterCommands(commands, '  ')).toBe(commands);
  });

  it('needs every word to match, in any order', () => {
    expect(filterCommands(commands, 'play ocean').map((command) => command.id)).toEqual(['look-s1']);
    expect(filterCommands(commands, 'ocean play').map((command) => command.id)).toEqual(['look-s1']);
    expect(filterCommands(commands, 'zzz')).toEqual([]);
  });

  it('puts a label that starts with the text first, then labels that contain it, then group matches', () => {
    const results = filterCommands(commands, 'look').map((command) => command.label);
    expect(results[0]).toBe('Looks');
    expect(results).toContain('Play Ocean');
  });

  it('finds an action by a synonym', () => {
    expect(filterCommands(commands, 'dark').map((command) => command.id)).toContain('action-blackout');
  });
});
