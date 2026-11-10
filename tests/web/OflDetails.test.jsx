// Component tests for the "View details" window in the online fixture search.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../src/api.js';
import { OflSearch } from '../../src/components/OflSearch.jsx';
import { accessibilityViolations } from './axe.js';

vi.mock('../../src/api.js', () => ({
  api: {
    searchOpenFixtureLibrary: vi.fn(),
    getOpenFixtureDetails: vi.fn(),
    importFromOpenFixtureLibrary: vi.fn(),
  },
}));

const RESULT = {
  key: 'american-dj/illusion-dotz-4-4',
  name: 'American DJ Illusion Dotz 4.4',
  fixtureId: 'ofl-american-dj-illusion-dotz-4-4',
};
const DETAILS = {
  key: RESULT.key,
  fixtureId: RESULT.fixtureId,
  manufacturer: 'American DJ',
  url: 'https://open-fixture-library.org/american-dj/illusion-dotz-4-4',
  name: 'Illusion Dotz 4.4',
  categories: ['Matrix', 'Moving Head'],
  authors: ['Ann', 'Bob'],
  createDate: '2019-10-30',
  lastModifyDate: '2020-01-02',
  note: 'Is the pixel order right?',
  links: {
    manual: ['https://example.test/manual.pdf'],
    productPage: ['https://www.adj.com/products/x'],
    video: [],
    other: [],
  },
  specifications: [
    { label: 'Weight', value: '16.5 kg' },
    { label: 'Power', value: '468 W' },
  ],
  modes: [
    {
      name: 'Basic 12-channel',
      isSupported: true,
      channels: [
        { name: 'Pan', type: 'pan', defaultValue: 128, ranges: [{ range: '0–255', label: 'Pan' }] },
        {
          name: 'Shutter',
          type: 'strobe',
          defaultValue: 32,
          ranges: [
            { range: '0–31', label: 'Closed' },
            { range: '32–63', label: 'Open' },
          ],
        },
      ],
    },
    {
      name: 'Extended pixels',
      isSupported: false,
      channels: [{ name: 'Dimmer', type: 'intensity', defaultValue: 0, ranges: [] }],
    },
  ],
};

async function openDetails(user, ownIds = new Set()) {
  api.searchOpenFixtureLibrary.mockResolvedValue({ results: [RESULT], total: 1 });
  const onAdd = vi.fn();
  render(<OflSearch ownIds={ownIds} onAdd={onAdd} />);
  await user.type(screen.getByLabelText('Brand or model'), 'dotz');
  await user.click(screen.getByRole('button', { name: 'Search' }));
  await user.click(await screen.findByRole('button', { name: `View details of ${RESULT.name}` }));
  return { onAdd };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('OflDetails', () => {
  it('opens a labelled window and loads the fixture, asking for the chosen key', async () => {
    const user = userEvent.setup();
    api.getOpenFixtureDetails.mockResolvedValue(DETAILS);
    await openDetails(user);
    const dialog = await screen.findByRole('dialog', { name: RESULT.name });
    expect(api.getOpenFixtureDetails).toHaveBeenCalledWith(RESULT.key);
    expect(await within(dialog).findByText(/American DJ · Matrix, Moving Head/)).toBeInTheDocument();
  });

  it('shows credit, specifications and links, and opens links safely in a new tab', async () => {
    const user = userEvent.setup();
    api.getOpenFixtureDetails.mockResolvedValue(DETAILS);
    await openDetails(user);
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(/Written by Ann, Bob, added 2019-10-30, updated 2020-01-02\./),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Is the pixel order right\?/)).toBeInTheDocument();
    expect(within(dialog).getByText('16.5 kg')).toBeInTheDocument();
    expect(within(dialog).getByText('468 W')).toBeInTheDocument();
    const manual = within(dialog).getByRole('link', { name: /Manual: example\.test\/manual\.pdf/ });
    expect(manual).toHaveAttribute('href', 'https://example.test/manual.pdf');
    expect(manual).toHaveAttribute('target', '_blank');
    expect(manual).toHaveAttribute('rel', 'noreferrer');
    expect(within(dialog).getByRole('link', { name: 'View on open-fixture-library.org' })).toHaveAttribute(
      'href',
      DETAILS.url,
    );
  });

  it('lists each mode with its channels, resting values and what each value range does', async () => {
    const user = userEvent.setup();
    api.getOpenFixtureDetails.mockResolvedValue(DETAILS);
    await openDetails(user);
    const table = await screen.findByRole('table', { name: 'Channels of Basic 12-channel' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const shutter = within(rows[2]);
    expect(shutter.getByRole('rowheader', { name: 'Shutter' })).toBeInTheDocument();
    expect(shutter.getByText('32')).toBeInTheDocument();
    expect(shutter.getByText('0–31')).toBeInTheDocument();
    expect(shutter.getByText('Closed')).toBeInTheDocument();
    expect(screen.getByText('Pixel channels, not copied')).toBeInTheDocument();
  });

  it('adds the fixture from inside the window and closes it', async () => {
    const user = userEvent.setup();
    api.getOpenFixtureDetails.mockResolvedValue(DETAILS);
    const type = { id: RESULT.fixtureId, name: 'Illusion Dotz 4.4' };
    api.importFromOpenFixtureLibrary.mockResolvedValue(type);
    const { onAdd } = await openDetails(user);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/American DJ ·/);
    await user.click(within(dialog).getByRole('button', { name: 'Add to my fixtures' }));
    expect(api.importFromOpenFixtureLibrary).toHaveBeenCalledWith(RESULT.key);
    expect(onAdd).toHaveBeenCalledWith(type);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText(/Added American DJ Illusion Dotz 4\.4/)).toBeInTheDocument();
  });

  it('does not offer to add a fixture that is already in your fixtures', async () => {
    const user = userEvent.setup();
    api.getOpenFixtureDetails.mockResolvedValue(DETAILS);
    await openDetails(user, new Set([RESULT.fixtureId]));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/American DJ ·/);
    expect(within(dialog).getByRole('button', { name: 'Already added' })).toBeDisabled();
  });

  it('shows the message and offers no add button action when the details cannot be loaded', async () => {
    const user = userEvent.setup();
    api.getOpenFixtureDetails.mockRejectedValue(new Error('Could not reach the Open Fixture Library.'));
    await openDetails(user);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Could not reach the Open Fixture Library.');
    expect(within(dialog).getByRole('button', { name: 'Add to my fixtures' })).toBeDisabled();
  });

  it('closes from the close button and hands focus back to the button that opened it', async () => {
    const user = userEvent.setup();
    api.getOpenFixtureDetails.mockResolvedValue(DETAILS);
    await openDetails(user);
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Close details' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `View details of ${RESULT.name}` })).toHaveFocus();
  });

  it('has no automated accessibility violations', async () => {
    const user = userEvent.setup();
    api.getOpenFixtureDetails.mockResolvedValue(DETAILS);
    await openDetails(user);
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/American DJ ·/);
    expect(await accessibilityViolations(dialog)).toEqual([]);
  });
});
