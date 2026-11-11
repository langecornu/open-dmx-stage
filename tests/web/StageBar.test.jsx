// Component tests for the always-visible "on stage" bar.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StageBar } from '../../src/components/StageBar.jsx';
import { accessibilityViolations } from './axe.js';

const project = {
  scenes: [{ id: 's1', name: 'Ocean' }],
  chases: [{ id: 'c1', name: 'Colour cycle', loop: false, steps: [{}, {}] }],
  groups: [],
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

function renderBar(engine, currentView = null) {
  const send = vi.fn();
  const onNavigate = vi.fn();
  const view = render(
    <StageBar
      engine={{ ...idle, ...engine }}
      project={project}
      send={send}
      onNavigate={onNavigate}
      currentView={currentView}
    />,
  );
  return { ...view, send, onNavigate };
}

describe('StageBar', () => {
  it('says nothing is playing and has no stop button when idle', () => {
    renderBar({});
    expect(screen.getByText('Nothing playing')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the playing sequence and stops it', async () => {
    const { send } = renderBar({ activeChaseId: 'c1', chaseStep: 0 });
    expect(screen.getByText('Colour cycle')).toBeInTheDocument();
    expect(screen.getByText('Sequence · Step 1 of 2 · plays once')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(send).toHaveBeenCalledWith({ type: 'chaseStop' });
  });

  it('stops the auto show', async () => {
    const { send } = renderBar({
      auto: { source: 'looks', beats: 4, order: 'order', itemId: 's1' },
      activeSceneId: 's1',
    });
    expect(screen.getByText('Auto show: Ocean')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(send).toHaveBeenCalledWith({ type: 'autoStop' });
  });

  it('jumps to the screen the sequence lives on', async () => {
    const { onNavigate } = renderBar({ activeChaseId: 'c1', chaseStep: 0 });
    await userEvent.click(screen.getByRole('button', { name: 'Open Sequences' }));
    expect(onNavigate).toHaveBeenCalledWith('chases');
  });

  it('does not offer to open the screen you are already on', () => {
    renderBar({ activeChaseId: 'c1', chaseStep: 0 }, 'chases');
    expect(screen.queryByRole('button', { name: /^Open/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('makes blackout unmistakable and turns the lights back on', async () => {
    const { send, container } = renderBar({ blackout: true });
    expect(screen.getByText('Lights are off')).toBeInTheDocument();
    expect(container.querySelector('.stage-blackout')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Lights on' }));
    expect(send).toHaveBeenCalledWith({ type: 'blackout', enabled: false });
  });

  it('lets an effect underneath be stopped on its own', async () => {
    const { send } = renderBar({ activeSceneId: 's1', effect: { type: 'sweep', beats: 4, groupId: null } });
    expect(screen.getByText('Sweep effect on all lights')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop effect' }));
    expect(send).toHaveBeenCalledWith({ type: 'effectStop' });
  });

  it('has no accessibility violations in any state', async () => {
    for (const engine of [{}, { blackout: true }, { activeChaseId: 'c1', chaseStep: 0 }]) {
      const { container, unmount } = renderBar(engine);
      expect(await accessibilityViolations(container)).toEqual([]);
      unmount();
    }
  });
});
