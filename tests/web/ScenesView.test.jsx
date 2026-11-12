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

  it('lists each look with a play button and how many of the lights it sets', () => {
    renderView();
    expect(screen.getByRole('button', { name: 'Play Warm wash' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Cool wash' })).toBeInTheDocument();
    const counts = screen.getAllByText('1 of 3 lights');
    expect(counts).toHaveLength(2);
    expect(counts[0]).toHaveAttribute('title', 'Not in this look: Par 2 and Lamp');
  });

  it('offers to fill lights added after the looks, copying from lights of the same kind in rig order', async () => {
    const user = userEvent.setup();
    const fixtures = [
      { id: 'p1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 },
      { id: 'p2', name: 'Par 2', typeId: 'generic-rgb-par', mode: 0, address: 4 },
      { id: 'p3', name: 'Par 3', typeId: 'generic-rgb-par', mode: 0, address: 7 },
      { id: 'p4', name: 'Par 4', typeId: 'generic-rgb-par', mode: 0, address: 10 },
    ];
    const police = { id: 'police', name: 'Police', values: { 1: 255, 6: 255 } }; // Par 1 red, Par 2 blue
    const { last } = renderView({ project: makeShow({ fixtures, scenes: [police] }) });
    const banner = screen.getByRole('region', { name: 'New lights' });
    expect(banner).toHaveTextContent('Par 3 and Par 4 are in none of your looks yet');
    expect(banner).toHaveTextContent('Par 1 → Par 3, Par 2 → Par 4');
    await user.click(within(banner).getByRole('button', { name: 'Fill the new lights' }));
    expect(last().scenes[0].values).toEqual({ 1: 255, 6: 255, 7: 255, 12: 255 });
  });

  it('hides the fill offer for those lights after Not now', async () => {
    const user = userEvent.setup();
    localStorage.clear();
    const fixtures = [
      { id: 'p1', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 },
      { id: 'p2', name: 'Par 2', typeId: 'generic-rgb-par', mode: 0, address: 4 },
    ];
    const { unmount } = renderView({
      project: makeShow({ fixtures, scenes: [{ id: 's', name: 'S', values: { 1: 9 } }] }),
    });
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region', { name: 'New lights' })).not.toBeInTheDocument();
    unmount();
    renderView({ project: makeShow({ fixtures, scenes: [{ id: 's', name: 'S', values: { 1: 9 } }] }) });
    expect(screen.queryByRole('region', { name: 'New lights' })).not.toBeInTheDocument();
    localStorage.clear();
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

  it('keeps a deliberate 0 for a channel that rests above 0, so playing the look does not bring it back to its resting value', async () => {
    const user = userEvent.setup();
    const resting = (name, type, defaultValue) => ({ name, type, defaultValue });
    const head = {
      id: 'mover',
      manufacturer: '',
      name: 'Mover',
      description: '',
      modes: [
        {
          name: 'm',
          channels: [resting('Pan', 'pan', 128), resting('Dimmer', 'intensity', 255), resting('Red', 'red', 0)],
        },
      ],
    };
    const project = makeShow({
      fixtureTypes: [head],
      fixtures: [{ id: 'm', name: 'Mover', typeId: 'mover', mode: 0, address: 20 }],
    });
    const { last } = renderView({ project });
    const frame = new Array(512).fill(0);
    frame[19] = 0; // pan deliberately at 0 (channel 20)
    frame[20] = 0; // dimmer deliberately closed (channel 21)
    frame[21] = 0; // red at 0, which is also its resting value
    act(() => frameStore.set(frame));
    await user.click(screen.getByRole('button', { name: 'Save current look' }));
    expect(last().scenes.at(-1).values).toEqual({ 20: 0, 21: 0 });
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

  it('duplicates a look right after the original, with its own id and a copy name', async () => {
    const user = userEvent.setup();
    const { last } = renderView();
    await user.click(screen.getByRole('button', { name: 'Duplicate look Warm wash' }));
    const { scenes } = last();
    expect(scenes.map((scene) => scene.name)).toEqual(['Warm wash', 'Warm wash copy', 'Cool wash']);
    expect(scenes[1].values).toEqual(SCENES[0].values);
    expect(scenes[1].id).not.toBe('warm');
  });

  it('replaces a look with what is on stage now, keeping its name and id', async () => {
    const user = userEvent.setup();
    const { last } = renderView();
    const frame = new Array(512).fill(0);
    frame[0] = 50; // channel 1
    act(() => frameStore.set(frame));
    await user.click(screen.getByRole('button', { name: 'Update Cool wash to what is on stage now' }));
    const cool = last().scenes[1];
    expect(cool).toMatchObject({ id: 'cool', name: 'Cool wash', values: { 1: 50 } });
  });

  it('shows whether any light is lit in the live capture strip', () => {
    renderView();
    expect(screen.getByText('Everything is dark')).toBeInTheDocument();
    const frame = new Array(512).fill(0);
    frame[0] = 255;
    act(() => frameStore.set(frame));
    expect(screen.getByText(/lights lit/)).toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderView();
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
