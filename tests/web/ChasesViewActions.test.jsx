// More component tests for the Sequences screen: making, playing, stopping, renaming, and editing steps.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { ChasesView } from '../../src/components/ChasesView.jsx';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES, makeLive, makeShow } from './fixtures.js';

const SCENES = [
  { id: 's1', name: 'Warm', values: { 1: 255 } },
  { id: 's2', name: 'Cool', values: { 3: 255 } },
];
const step = (id, sceneId) => ({ id, sceneId, fadeMs: 1000, holdMs: 2000, fadeBeats: 2, holdBeats: 4 });
const chase = (id, name, steps = [step('a', 's1')]) => ({ id, name, loop: true, timing: 'seconds', steps });

function renderView({ chases = [chase('c1', 'Opening')], scenes = SCENES, live = makeLive() } = {}) {
  const project = makeShow({ scenes, chases });
  const update = vi.fn();
  const flush = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ChasesView
      project={project}
      patch={buildPatch(project, BUILTIN_TYPES)}
      update={update}
      flush={flush}
      live={live}
    />,
  );
  return { ...view, update, flush, live, project, last: () => update.mock.calls.at(-1)[0](project) };
}

describe('ChasesView actions', () => {
  it('invites you to make a sequence when there are none', () => {
    renderView({ chases: [] });
    expect(screen.getByText('No sequences yet')).toBeInTheDocument();
  });

  it('makes a new numbered sequence that loops, in seconds, with no steps, and selects it', async () => {
    const user = userEvent.setup();
    const { last } = renderView();
    await user.click(screen.getByRole('button', { name: 'New sequence' }));
    const created = last().chases.at(-1);
    expect(created).toMatchObject({ name: 'Sequence 2', loop: true, timing: 'seconds', steps: [] });
    expect(created.id).toBeTruthy();
  });

  it('deletes the open sequence', async () => {
    const user = userEvent.setup();
    const { last } = renderView();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(last().chases).toEqual([]);
  });

  it('renames it, keeping the old name when the field is emptied, and toggles looping', () => {
    const { update, project } = renderView();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Finale' } });
    expect(update.mock.calls.at(-1)[0](project).chases[0].name).toBe('Finale');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    expect(update.mock.calls.at(-1)[0](project).chases[0].name).toBe('Opening');
    fireEvent.click(screen.getByLabelText('Loop'));
    expect(update.mock.calls.at(-1)[0](project).chases[0].loop).toBe(false);
  });

  it('saves pending edits first, then starts the sequence', async () => {
    const user = userEvent.setup();
    const { flush, live } = renderView();
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(flush).toHaveBeenCalled();
    expect(live.send).toHaveBeenCalledWith({ type: 'chaseStart', chaseId: 'c1' });
  });

  it('shows Stop while the sequence plays, marks it and its current step, and stops it', async () => {
    const user = userEvent.setup();
    const two = chase('c1', 'Opening', [step('a', 's1'), step('b', 's2')]);
    const { live, container } = renderView({
      chases: [two],
      live: makeLive({ activeChaseId: 'c1', chaseStep: 1 }),
    });
    expect(screen.getByText('Playing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
    const rows = container.querySelectorAll('.step-row:not(.step-head)');
    expect(rows[0]).toHaveAttribute('data-playing', 'false');
    expect(rows[1]).toHaveAttribute('data-playing', 'true');
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(live.send).toHaveBeenCalledWith({ type: 'chaseStop' });
  });

  it('switches between sequences from the list', async () => {
    const user = userEvent.setup();
    renderView({ chases: [chase('c1', 'Opening'), chase('c2', 'Finale', [step('x', 's2')])] });
    expect(screen.getByLabelText('Name')).toHaveValue('Opening');
    await user.click(screen.getByRole('button', { name: /Finale/ }));
    expect(screen.getByLabelText('Name')).toHaveValue('Finale');
    expect(screen.getByLabelText('Look for step 1')).toHaveValue('s2');
  });

  it('asks you to save a look first when there are none, and cannot add a step', () => {
    renderView({ scenes: [], chases: [chase('c1', 'Opening', [])] });
    expect(screen.getByRole('button', { name: 'Add step' })).toBeDisabled();
    expect(screen.getByText(/Save a look first/)).toBeInTheDocument();
  });

  it('changes the look of a step, and stays put when a step is moved past either end', async () => {
    const user = userEvent.setup();
    const two = chase('c1', 'Opening', [step('a', 's1'), step('b', 's2')]);
    const { update, project } = renderView({ chases: [two] });
    await user.selectOptions(screen.getByLabelText('Look for step 1'), 's2');
    expect(update.mock.calls.at(-1)[0](project).chases[0].steps[0].sceneId).toBe('s2');
    const calls = update.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Move step 1 up' }));
    await user.click(screen.getByRole('button', { name: 'Move step 2 down' }));
    expect(update.mock.calls.length, 'moving past the ends changes nothing').toBe(calls);
    await user.click(screen.getByRole('button', { name: 'Move step 1 down' }));
    expect(
      update.mock.calls
        .at(-1)[0](project)
        .chases[0].steps.map((s) => s.id),
    ).toEqual(['b', 'a']);
  });

  it('turns typed seconds into milliseconds, limited to 0 and 10 minutes', () => {
    const { update, project } = renderView();
    const fade = screen.getByLabelText('Fade seconds for step 1');
    fireEvent.change(fade, { target: { value: '2.5' } });
    expect(update.mock.calls.at(-1)[0](project).chases[0].steps[0].fadeMs).toBe(2500);
    fireEvent.change(fade, { target: { value: '-4' } });
    expect(update.mock.calls.at(-1)[0](project).chases[0].steps[0].fadeMs).toBe(0);
    fireEvent.change(screen.getByLabelText('Hold seconds for step 1'), { target: { value: '99999' } });
    expect(update.mock.calls.at(-1)[0](project).chases[0].steps[0].holdMs).toBe(600000);
  });

  it('shows a timeline of the steps, labelled with the total length', () => {
    renderView();
    expect(screen.getByRole('img', { name: 'Timeline of Opening, 3s long' })).toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderView();
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
