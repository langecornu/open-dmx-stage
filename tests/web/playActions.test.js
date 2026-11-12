// Tests for what pressing a pad does, shared by Perform and Home: looks and sequences.
import { describe, expect, it, vi } from 'vitest';

import { isActionPlaying, playAction } from '../../src/utils/playActions.js';

const idle = { activeSceneId: null, activeChaseId: null };

async function press(action, engine = idle) {
  const send = vi.fn();
  const flush = vi.fn().mockResolvedValue(undefined);
  await playAction({ action, engine, send, flush, fadeMs: 500 });
  return { send, flush };
}

describe('playAction', () => {
  it('plays a look with the fade, after saving', async () => {
    const { send, flush } = await press({ type: 'look', id: 's1' });
    expect(flush).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith({ type: 'recall', sceneId: 's1', fadeMs: 500 });
  });

  it('starts a sequence, and stops it when pressed again', async () => {
    expect((await press({ type: 'sequence', id: 'c1' })).send).toHaveBeenCalledWith({
      type: 'chaseStart',
      chaseId: 'c1',
    });
    const stopped = await press({ type: 'sequence', id: 'c1' }, { ...idle, activeChaseId: 'c1' });
    expect(stopped.send).toHaveBeenCalledWith({ type: 'chaseStop' });
    expect(stopped.flush).not.toHaveBeenCalled();
  });
});

describe('isActionPlaying', () => {
  it('knows which pad is on stage', () => {
    expect(isActionPlaying({ type: 'look', id: 's1' }, { ...idle, activeSceneId: 's1', activeChaseId: 'c1' })).toBe(
      false,
    );
    expect(isActionPlaying({ type: 'look', id: 's1' }, { ...idle, activeSceneId: 's1' })).toBe(true);
    expect(isActionPlaying({ type: 'sequence', id: 'c1' }, { ...idle, activeChaseId: 'c1' })).toBe(true);
  });
});
