// Component tests for the Looks screen: saving what is on stage, playing, renaming and deleting looks.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { ScenesView } from '../../src/components/ScenesView.jsx';
import { frameStore } from '../../src/hooks/frameStore.js';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES, makeLive, makeShow } from './fixtures.js';

const SCENES = [
  { id: 'warm', name: 'Warm wash', values: { 1: 255, 2: 120 } },
  { id: 'cool', name: 'Cool wash', values: { 3: 255 } },
];

function renderView({ project = makeShow({ scenes: SCENES }), live = makeLive() } = {}) {
  const update = vi.fn();
  const flush = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <ScenesView
      project={project}
      patch={buildPatch(project, BUILTIN_TYPES)}
      update={update}
      flush={flush}
      live={live}
    />,
  );
  return { ...view, update, flush, live, project, last: () => update.mock.calls.at(-1)[0](project) };
}

afterEach(() => {
  act(() => frameStore.set(new Array(512).fill(0)));
});

describe('ScenesView', () => {
  it('shows an empty state when there are no looks', () => {
    renderView({ project: makeShow() });
    expect(screen.getByText('No looks saved yet')).toBeInTheDocument();
  });

  it('lists each look with a play button and how many fixtures it uses', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'Play Warm wash' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Cool wash' })).toBeInTheDocument();
    expect(screen.getAllByText('3 fixtures')).toHaveLength(2);
  });

  it('saves what is on stage right now, keeping only channels above zero, with a default name', async () => {
    const user = userEvent.setup();
    const { last } = renderView();
    const frame = new Array(512).fill(0);
    frame[0] = 200; // channel 1
    frame[4] = 90; // channel 5
    frame[9] = 255; // channel 10, the lamp
    frame[99] = 77; // channel 100 is not patched, so it is not saved
    act(() => frameStore.set(frame));
    await user.click(screen.getByRole('button', { name: 'Save current look' }));
    const [created] = last().scenes.slice(-1);
    expect(created.name).toBe('Look 3');
    expect(created.values).toEqual({ 1: 200, 5: 90, 10: 255 });
    expect(created.id).toBeTruthy();
  });

  it('uses the name you typed, trimmed, and clears the field afterwards', async () => {
    const user = userEvent.setup();
    const { last } = renderView();
    const field = screen.getByLabelText('Name this look');
    await user.type(field, '  Sunset  ');
    await user.click(screen.getByRole('button', { name: 'Save current look' }));
    expect(last().scenes.at(-1).name).toBe('Sunset');
    expect(field).toHaveValue('');
  });

  it('cannot save a look when there are no fixtures', () => {
    renderView({ project: makeShow({ fixtures: [] }) });
    expect(screen.getByRole('button', { name: 'Save current look' })).toBeDisabled();
  });

  it('saves pending edits first, then plays the look with the chosen fade', async () => {
    const user = userEvent.setup();
    const { flush, live } = renderView();
    await user.click(screen.getByRole('button', { name: 'Play Warm wash' }));
    expect(flush).toHaveBeenCalled();
    expect(live.send).toHaveBeenLastCalledWith({ type: 'recall', sceneId: 'warm', fadeMs: 1000 });
    await user.selectOptions(screen.getByLabelText('Fade when playing'), '0');
    await user.click(screen.getByRole('button', { name: 'Play Cool wash' }));
    expect(live.send).toHaveBeenLastCalledWith({ type: 'recall', sceneId: 'cool', fadeMs: 0 });
    expect(screen.getByRole('option', { name: 'Instant' })).toBeInTheDocument();
  });

  it('marks the look that is on stage', () => {
    renderView({ live: makeLive({ activeSceneId: 'cool' }) });
    const cool = within(screen.getByRole('button', { name: 'Play Cool wash' }).closest('article'));
    expect(cool.getByText('On stage')).toBeInTheDocument();
    expect(screen.getAllByText('On stage')).toHaveLength(1);
  });

  it('renames a look, and keeps the old name if the field is emptied', () => {
    const { last, update } = renderView();
    fireEvent.change(screen.getByLabelText('Name for look Warm wash'), { target: { value: 'Golden' } });
    expect(last().scenes[0].name).toBe('Golden');
    fireEvent.change(screen.getByLabelText('Name for look Warm wash'), { target: { value: '' } });
    expect(update.mock.calls.at(-1)[0](makeShow({ scenes: SCENES })).scenes[0].name).toBe('Warm wash');
  });

  it('deletes a look and removes it from every sequence that used it', async () => {
    const user = userEvent.setup();
    const chase = {
      id: 'c',
      name: 'Show',
      loop: true,
      timing: 'seconds',
      steps: [
        { id: '1', sceneId: 'warm', fadeMs: 0, holdMs: 1, fadeBeats: 0, holdBeats: 1 },
        { id: '2', sceneId: 'cool', fadeMs: 0, holdMs: 1, fadeBeats: 0, holdBeats: 1 },
      ],
    };
    const project = makeShow({ scenes: SCENES, chases: [chase] });
    const { update } = renderView({ project });
    await user.click(screen.getByRole('button', { name: 'Delete look Warm wash' }));
    const next = update.mock.calls.at(-1)[0](project);
    expect(next.scenes.map((scene) => scene.id)).toEqual(['cool']);
    expect(next.chases[0].steps.map((step) => step.sceneId)).toEqual(['cool']);
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderView();
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
