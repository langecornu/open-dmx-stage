// Component tests for Setup: adding fixtures with automatic addresses, editing them, importing fixture files.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { api } from '../../src/api.js';
import { PatchView } from '../../src/components/PatchView.jsx';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES, makeShow } from './fixtures.js';

vi.mock('../../src/api.js', () => ({
  api: { importOpenFixture: vi.fn(), importQlcFixture: vi.fn(), importProject: vi.fn() },
}));

function renderView(project = makeShow()) {
  const update = vi.fn();
  const view = render(
    <PatchView
      project={project}
      library={BUILTIN_TYPES}
      patch={buildPatch(project, BUILTIN_TYPES)}
      update={update}
      replaceProject={vi.fn()}
    />,
  );
  return { ...view, update, project, last: () => update.mock.calls.at(-1)[0](project) };
}

const fileOf = (name, text) => new File([text], name, { type: 'application/json' });

beforeEach(() => {
  vi.resetAllMocks();
});

// A full universe renders 512 rig rows in jsdom: about 1.5 s alone, but past the 5 s default when the whole suite runs
// in parallel, so the two full-universe tests get more room.
const FULL_UNIVERSE_TIMEOUT_MS = 20_000;

describe('PatchView', () => {
  it('says which DMX address is free next for the chosen light and quantity', () => {
    renderView(makeShow({ fixtures: [] }));
    expect(screen.getByText(/Next free DMX address for this choice: 1\./)).toBeInTheDocument();
  });

  it('invites you to add the first fixture when the rig is empty', () => {
    renderView(makeShow({ fixtures: [] }));
    expect(screen.getByText('Your rig is empty')).toBeInTheDocument();
  });

  it('lists the rig with each fixture type, mode and the channels it uses', () => {
    renderView();
    expect(screen.getByLabelText('Name for Par 1')).toHaveValue('Par 1');
    expect(screen.getAllByText('RGB LED par · 3 channel').length).toBeGreaterThan(0);
    expect(screen.getByText('Uses 1–3')).toBeInTheDocument();
    expect(screen.getByText('Uses 10–10')).toBeInTheDocument();
  });

  it('adds the chosen fixture at the next free address', async () => {
    const user = userEvent.setup();
    const { last } = renderView();
    await user.selectOptions(screen.getByLabelText('Fixture'), 'generic-rgb-par');
    await user.click(screen.getByRole('button', { name: 'Add to rig' }));
    const added = last().fixtures.at(-1);
    expect(added).toMatchObject({ typeId: 'generic-rgb-par', mode: 0, address: 7, name: 'RGB LED par 4' });
  });

  it('adds several at once, one after another', async () => {
    const user = userEvent.setup();
    const { last } = renderView(makeShow({ fixtures: [] }));
    await user.selectOptions(screen.getByLabelText('Fixture'), 'generic-rgb-par');
    fireEvent.change(screen.getByLabelText('How many'), { target: { value: '3' } });
    await user.click(screen.getByRole('button', { name: 'Add to rig' }));
    expect(last().fixtures.map((fixture) => fixture.address)).toEqual([1, 4, 7]);
  });

  it('keeps the quantity between 1 and 64', () => {
    renderView();
    const field = screen.getByLabelText('How many');
    fireEvent.change(field, { target: { value: '500' } });
    expect(field).toHaveValue(64);
    fireEvent.change(field, { target: { value: '0' } });
    expect(field).toHaveValue(1);
  });

  it('says so when the universe is full, and adds nothing', async () => {
    const user = userEvent.setup();
    const dimmers = Array.from({ length: 512 }, (_, index) => ({
      id: `d${index}`,
      name: `Dimmer ${index + 1}`,
      typeId: 'generic-dimmer',
      mode: 0,
      address: index + 1,
    }));
    const { update } = renderView(makeShow({ fixtures: dimmers }));
    await user.click(screen.getByRole('button', { name: 'Add to rig' }));
    expect(screen.getByRole('status')).toHaveTextContent('No free DMX address range');
    expect(update).not.toHaveBeenCalled();
  }, FULL_UNIVERSE_TIMEOUT_MS);

  it('adds as many as fit and says how many did not', async () => {
    const user = userEvent.setup();
    const fixtures = Array.from({ length: 510 }, (_, index) => ({
      id: `d${index}`,
      name: `Dimmer ${index + 1}`,
      typeId: 'generic-dimmer',
      mode: 0,
      address: index + 1,
    }));
    const { last } = renderView(makeShow({ fixtures }));
    await user.selectOptions(screen.getByLabelText('Fixture'), 'generic-dimmer');
    fireEvent.change(screen.getByLabelText('How many'), { target: { value: '5' } });
    await user.click(screen.getByRole('button', { name: 'Add to rig' }));
    expect(last().fixtures).toHaveLength(512);
    expect(screen.getByRole('status')).toHaveTextContent('Only 2 of 5 fixtures fit in the universe.');
  }, FULL_UNIVERSE_TIMEOUT_MS);

  it('renames a fixture, keeps the old name when emptied, and limits the address to 1 to 512', () => {
    const { update, project } = renderView();
    fireEvent.change(screen.getByLabelText('Name for Par 1'), { target: { value: 'Front left' } });
    expect(update.mock.calls.at(-1)[0](project).fixtures[0].name).toBe('Front left');
    fireEvent.change(screen.getByLabelText('Name for Par 1'), { target: { value: '' } });
    expect(update.mock.calls.at(-1)[0](project).fixtures[0].name).toBe('Par 1');
    fireEvent.change(screen.getByLabelText('DMX address for Par 1'), { target: { value: '900' } });
    expect(update.mock.calls.at(-1)[0](project).fixtures[0].address).toBe(512);
    fireEvent.change(screen.getByLabelText('DMX address for Par 1'), { target: { value: '0' } });
    expect(update.mock.calls.at(-1)[0](project).fixtures[0].address).toBe(1);
  });

  it('removes a fixture', async () => {
    const user = userEvent.setup();
    const { last } = renderView();
    await user.click(screen.getByRole('button', { name: 'Remove Par 1' }));
    expect(last().fixtures.map((fixture) => fixture.id)).toEqual(['b', 'c']);
  });

  it('warns about overlaps, fixtures running past 512, and fixtures whose type is missing', () => {
    renderView(
      makeShow({
        fixtures: [
          { id: 'a', name: 'One', typeId: 'generic-rgb-par', mode: 0, address: 1 },
          { id: 'b', name: 'Two', typeId: 'generic-rgb-par', mode: 0, address: 2 },
          { id: 'c', name: 'Edge', typeId: 'generic-rgb-par', mode: 0, address: 511 },
          { id: 'd', name: 'Lost', typeId: 'gone', mode: 0, address: 100 },
        ],
      }),
    );
    expect(screen.getAllByText('Overlap').length).toBeGreaterThan(0);
    expect(screen.getByText('Exceeds 512')).toBeInTheDocument();
    expect(screen.getByText('Missing type')).toBeInTheDocument();
  });

  it('imports an Open Fixture Library file, makes it the chosen fixture and says so', async () => {
    api.importOpenFixture.mockResolvedValue({
      id: 'ofl-acme-wash',
      manufacturer: 'Acme',
      name: 'Wash',
      description: '',
      modes: [{ name: 'Basic', channels: [{ name: 'Dimmer', type: 'intensity', defaultValue: 0 }] }],
    });
    const { last } = renderView();
    fireEvent.change(screen.getByLabelText(/Import fixture file/), {
      target: { files: [fileOf('wash.json', '{"name":"Wash"}')] },
    });
    expect(await screen.findByText(/Imported Wash/)).toBeInTheDocument();
    expect(api.importOpenFixture).toHaveBeenCalledWith({ name: 'Wash' }, '');
    expect(last().fixtureTypes.map((type) => type.id)).toEqual(['ofl-acme-wash']);
  });

  it('imports a QLC+ file by its .qxf name, replacing an earlier import of the same fixture', async () => {
    const converted = {
      id: 'qlc-x',
      manufacturer: 'Q',
      name: 'X',
      description: '',
      modes: [{ name: 'm', channels: [] }],
    };
    api.importQlcFixture.mockResolvedValue(converted);
    const { update, project } = renderView(makeShow({ fixtureTypes: [{ ...converted, name: 'Old' }] }));
    fireEvent.change(screen.getByLabelText(/Import fixture file/), { target: { files: [fileOf('x.QXF', '<xml/>')] } });
    expect(await screen.findByText(/Imported X/)).toBeInTheDocument();
    expect(api.importQlcFixture).toHaveBeenCalledWith('<xml/>');
    expect(update.mock.calls.at(-1)[0](project).fixtureTypes).toEqual([converted]);
  });

  it('shows why an import failed, and changes nothing', async () => {
    api.importOpenFixture.mockRejectedValue(new Error('Not an Open Fixture Library fixture'));
    const { update } = renderView();
    fireEvent.change(screen.getByLabelText(/Import fixture file/), {
      target: { files: [fileOf('bad.json', '{"name":1}')] },
    });
    expect(await screen.findByText(/Import failed: Not an Open Fixture Library fixture/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('shows a file that is not JSON as a failed import', async () => {
    renderView();
    fireEvent.change(screen.getByLabelText(/Import fixture file/), {
      target: { files: [fileOf('bad.json', 'not json')] },
    });
    expect(await screen.findByText(/Import failed:/)).toBeInTheDocument();
    expect(api.importOpenFixture).not.toHaveBeenCalled();
  });

  it('does nothing when the file chooser is closed without a file', () => {
    const { update } = renderView();
    fireEvent.change(screen.getByLabelText(/Import fixture file/), { target: { files: [] } });
    expect(update).not.toHaveBeenCalled();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderView();
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
