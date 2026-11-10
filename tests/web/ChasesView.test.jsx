// Component tests for the sequence editor: stable step ids, reordering, adding steps, and list semantics.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChasesView } from '../../src/components/ChasesView.jsx';

const SCENES = [
  { id: 's1', name: 'Warm', values: {} },
  { id: 's2', name: 'Cool', values: {} },
];

function projectWith(steps) {
  return {
    schemaVersion: 2,
    name: 'Test',
    fixtureTypes: [],
    fixtures: [],
    scenes: SCENES,
    chases: [{ id: 'c1', name: 'Opening', loop: true, steps }],
  };
}

function renderView(project) {
  const update = vi.fn();
  render(
    <ChasesView
      project={project}
      patch={{ channels: new Map(), fixtures: [] }}
      update={update}
      flush={vi.fn().mockResolvedValue(undefined)}
      live={{ engine: { activeChaseId: null, chaseStep: null }, send: vi.fn() }}
    />,
  );
  return { update };
}

const STEPS = [
  { id: 'step-a', sceneId: 's1', fadeMs: 1000, holdMs: 2000 },
  { id: 'step-b', sceneId: 's2', fadeMs: 500, holdMs: 1500 },
];

describe('ChasesView', () => {
  it('lists sequences as a real list and shows each step with its look and timings', () => {
    renderView(projectWith(STEPS));
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Opening/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByLabelText('Look for step 2')).toHaveValue('s2');
    expect(screen.getByLabelText('Fade seconds for step 2')).toHaveValue(0.5);
    expect(screen.getByLabelText('Hold seconds for step 2')).toHaveValue(1.5);
  });

  it('keeps each step identity when the order changes, so ids follow the steps', async () => {
    const user = userEvent.setup();
    const project = projectWith(STEPS);
    const { update } = renderView(project);
    await user.click(screen.getByRole('button', { name: 'Move step 2 up' }));
    const next = update.mock.calls[0][0](project);
    expect(next.chases[0].steps.map((step) => step.id)).toEqual(['step-b', 'step-a']);
  });

  it('gives a newly added step its own unique id', async () => {
    const user = userEvent.setup();
    const project = projectWith(STEPS);
    const { update } = renderView(project);
    await user.click(screen.getByRole('button', { name: 'Add step' }));
    const steps = update.mock.calls[0][0](project).chases[0].steps;
    expect(steps).toHaveLength(3);
    expect(new Set(steps.map((step) => step.id)).size, 'every step id is unique').toBe(3);
    expect(steps[2].sceneId).toBe('s1');
  });

  it('removes only the chosen step', async () => {
    const user = userEvent.setup();
    const project = projectWith(STEPS);
    const { update } = renderView(project);
    await user.click(screen.getByRole('button', { name: 'Remove step 1' }));
    expect(update.mock.calls[0][0](project).chases[0].steps.map((step) => step.id)).toEqual(['step-b']);
  });

  it('keeps Play disabled until the sequence has steps', () => {
    renderView(projectWith([]));
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });
});
