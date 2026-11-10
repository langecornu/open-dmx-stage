// Component tests for the online fixture search: searching, empty and error states, adding, and stale answers.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../../src/api.js';
import { OflSearch } from '../../src/components/OflSearch.jsx';
import { accessibilityViolations } from './axe.js';

vi.mock('../../src/api.js', () => ({
  api: { searchOpenFixtureLibrary: vi.fn(), importFromOpenFixtureLibrary: vi.fn() },
}));

const RESULTS = {
  total: 2,
  results: [
    { key: 'uking/mini-gobo', name: 'U`King Mini Gobo Moving Head Light', fixtureId: 'ofl-uking-mini-gobo' },
    { key: 'uking/par-can', name: 'U`King Par Can', fixtureId: 'ofl-uking-par-can' },
  ],
};

function renderSearch(ownIds = new Set()) {
  const onAdd = vi.fn();
  render(<OflSearch ownIds={ownIds} onAdd={onAdd} />);
  return { onAdd };
}

async function search(user, words = 'uking') {
  await user.type(screen.getByLabelText('Brand or model'), words);
  await user.click(screen.getByRole('button', { name: 'Search' }));
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('OflSearch', () => {
  it('explains where the search goes and what is sent', () => {
    renderSearch();
    expect(screen.getByRole('link', { name: 'Open Fixture Library' })).toHaveAttribute(
      'href',
      'https://open-fixture-library.org',
    );
    expect(screen.getByText(/Only your search words are sent/)).toBeInTheDocument();
  });

  it('searches and lists the results', async () => {
    const user = userEvent.setup();
    api.searchOpenFixtureLibrary.mockResolvedValue(RESULTS);
    renderSearch();
    await search(user);
    expect(api.searchOpenFixtureLibrary).toHaveBeenCalledWith('uking');
    const list = await screen.findByRole('list', { name: 'Search results' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });

  it('says when there are more results than shown', async () => {
    const user = userEvent.setup();
    api.searchOpenFixtureLibrary.mockResolvedValue({ ...RESULTS, total: 108 });
    renderSearch();
    await search(user, 'par');
    expect(await screen.findByText(/Showing 2 of 108/)).toBeInTheDocument();
  });

  it('refuses a search that is too short without asking the server', async () => {
    const user = userEvent.setup();
    renderSearch();
    await search(user, 'a');
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 2 letters');
    expect(api.searchOpenFixtureLibrary).not.toHaveBeenCalled();
  });

  it('says so when nothing is found', async () => {
    const user = userEvent.setup();
    api.searchOpenFixtureLibrary.mockResolvedValue({ results: [], total: 0 });
    renderSearch();
    await search(user, 'zzzz');
    expect(await screen.findByText(/Nothing found for/)).toBeInTheDocument();
  });

  it('shows the server message when the library cannot be reached or search is off', async () => {
    const user = userEvent.setup();
    api.searchOpenFixtureLibrary.mockRejectedValue(new Error('Could not reach the Open Fixture Library.'));
    renderSearch();
    await search(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the Open Fixture Library.');
    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled();
  });

  it('adds a fixture, hands it to the screen, and confirms', async () => {
    const user = userEvent.setup();
    api.searchOpenFixtureLibrary.mockResolvedValue(RESULTS);
    const type = { id: 'ofl-uking-mini-gobo', name: 'Mini Gobo' };
    api.importFromOpenFixtureLibrary.mockResolvedValue(type);
    const { onAdd } = renderSearch();
    await search(user);
    await user.click(await screen.findByRole('button', { name: 'Add U`King Mini Gobo Moving Head Light' }));
    expect(api.importFromOpenFixtureLibrary).toHaveBeenCalledWith('uking/mini-gobo');
    expect(onAdd).toHaveBeenCalledWith(type);
    expect(await screen.findByText(/Added U`King Mini Gobo Moving Head Light/)).toBeInTheDocument();
  });

  it('shows an error and adds nothing when a fixture cannot be converted', async () => {
    const user = userEvent.setup();
    api.searchOpenFixtureLibrary.mockResolvedValue(RESULTS);
    api.importFromOpenFixtureLibrary.mockRejectedValue(
      new Error('This fixture uses pixel or matrix channels, which are not supported yet.'),
    );
    const { onAdd } = renderSearch();
    await search(user);
    await user.click(await screen.findByRole('button', { name: /Add U`King Par Can/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('pixel or matrix');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('marks fixtures you already have, and does not offer to add them again', async () => {
    const user = userEvent.setup();
    api.searchOpenFixtureLibrary.mockResolvedValue(RESULTS);
    renderSearch(new Set(['ofl-uking-par-can']));
    await search(user);
    expect(await screen.findByRole('button', { name: 'U`King Par Can is already added' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Add U`King Mini Gobo/ })).toBeEnabled();
  });

  it('ignores an older answer that arrives after a newer search', async () => {
    const user = userEvent.setup();
    let resolveFirst;
    api.searchOpenFixtureLibrary
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ results: [{ key: 'b/new', name: 'Newer result', fixtureId: 'ofl-b-new' }], total: 1 });
    renderSearch();
    await user.type(screen.getByLabelText('Brand or model'), 'old');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    // A new search can start while the first is still running; only the newest answer is shown.
    await user.type(screen.getByLabelText('Brand or model'), 'er');
    await user.click(screen.getByRole('button', { name: 'Searching…' }));
    expect(await screen.findByText('Newer result')).toBeInTheDocument();
    resolveFirst({ results: [{ key: 'a/old', name: 'Older result', fixtureId: 'ofl-a-old' }], total: 1 });
    await Promise.resolve();
    expect(screen.queryByText('Older result')).not.toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    const user = userEvent.setup();
    api.searchOpenFixtureLibrary.mockResolvedValue(RESULTS);
    const { container } = render(<OflSearch ownIds={new Set()} onAdd={vi.fn()} />);
    await user.type(screen.getByLabelText('Brand or model'), 'uking');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByRole('list', { name: 'Search results' });
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
