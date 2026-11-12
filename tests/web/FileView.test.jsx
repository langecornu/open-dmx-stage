// Component tests for File: saving under the show's name into a folder of a tree, making folders, and opening a saved
// show from a list with its venue, fixtures, looks and sequences.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FileView, folderTree } from '../../src/components/FileView.jsx';
import { accessibilityViolations } from './axe.js';

vi.mock('../../src/api.js', () => ({
  api: {
    listShows: vi.fn(),
    saveShow: vi.fn(),
    createShowFolder: vi.fn(),
    openShow: vi.fn(),
    newShow: vi.fn(),
    deleteShow: vi.fn(),
    importProject: vi.fn(),
  },
}));
const { api } = await import('../../src/api.js');

const project = { id: 'now', name: 'Demo light show' };
const club = {
  id: 'club',
  name: 'Club night',
  folder: 'Clubs/Montreal',
  savedAt: '2026-11-01T20:00:00.000Z',
  venue: 'Club Soda',
  venues: 2,
  lights: 5,
  looks: 13,
  sequences: 4,
};
const wedding = {
  ...club,
  id: 'wed',
  name: 'Wedding',
  folder: '',
  venue: 'Hall',
  venues: 1,
  lights: 1,
  looks: 1,
  sequences: 1,
};
const listing = (current = { ...project, folder: null, savedAt: null }) => ({
  current,
  shows: [club, wedding],
  folders: ['Clubs', 'Clubs/Montreal'],
});

let replaceProject;
let flush;
function renderFile(props = {}) {
  replaceProject = vi.fn();
  flush = vi.fn().mockResolvedValue(undefined);
  return render(
    <FileView project={project} flush={flush} replaceProject={replaceProject} update={vi.fn()} {...props} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listShows.mockResolvedValue(listing());
});

describe('folderTree', () => {
  it('puts the top first, then each folder under its parent, indented by depth', () => {
    expect(folderTree(['Weddings', 'Clubs/Montreal', 'Clubs'])).toEqual([
      { path: '', name: 'Shows', depth: 0 },
      { path: 'Clubs', name: 'Clubs', depth: 1 },
      { path: 'Clubs/Montreal', name: 'Montreal', depth: 2 },
      { path: 'Weddings', name: 'Weddings', depth: 1 },
    ]);
  });
});

describe('FileView', () => {
  it('saves under the name from the top into the chosen folder, after saving pending edits', async () => {
    const user = userEvent.setup();
    api.saveShow.mockResolvedValue({ project: { ...project, name: 'Demo light show' }, folder: 'Clubs/Montreal' });
    renderFile();
    expect(screen.getByLabelText('Name')).toHaveValue('Demo light show');
    expect(await screen.findByText(/is not in your list yet/)).toBeInTheDocument();
    const tree = screen.getByRole('group', { name: 'Save in' });
    expect(within(tree).getByRole('radio', { name: /Shows/ })).toBeChecked();
    await user.click(await within(tree).findByRole('radio', { name: /Montreal/ }));
    await user.click(screen.getByRole('button', { name: 'Save in Shows › Clubs › Montreal' }));
    expect(flush).toHaveBeenCalled();
    expect(api.saveShow).toHaveBeenCalledWith('Demo light show', 'Clubs/Montreal');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved "Demo light show" in Shows › Clubs › Montreal.');
    expect(replaceProject).toHaveBeenCalled();
  });

  it('starts in the folder the open show is saved in, and says when it was saved', async () => {
    api.listShows.mockResolvedValue(listing({ ...club, id: 'now', name: 'Demo light show' }));
    renderFile();
    await waitFor(() =>
      expect(
        within(screen.getByRole('group', { name: 'Save in' })).getByRole('radio', { name: /Montreal/ }),
      ).toBeChecked(),
    );
    expect(screen.getByText(/is saved in Shows › Clubs › Montreal/)).toBeInTheDocument();
  });

  it('makes a folder inside the selected one, and selects it', async () => {
    const user = userEvent.setup();
    api.createShowFolder.mockResolvedValue({ folders: ['Clubs', 'Clubs/Montreal', 'Clubs/Quebec'] });
    renderFile();
    await user.click(
      await within(screen.getByRole('group', { name: 'Save in' })).findByRole('radio', { name: /^Clubs/ }),
    );
    await user.type(screen.getByLabelText('New folder in Shows › Clubs'), 'Quebec');
    await user.click(screen.getByRole('button', { name: /Make folder/ }));
    expect(api.createShowFolder).toHaveBeenCalledWith('Clubs/Quebec');
    expect(await screen.findByRole('button', { name: 'Save in Shows › Clubs › Quebec' })).toBeInTheDocument();
  });

  it('lists saved shows by folder with their venue, fixtures, looks and sequences, and opens one', async () => {
    const user = userEvent.setup();
    api.openShow.mockResolvedValue({ id: 'club', name: 'Club night' });
    renderFile();
    const open = screen.getByRole('region', { name: 'Open' });
    const row = (await within(open).findByText('Club night')).closest('li');
    expect(row).toHaveTextContent('Club Soda (+1 more venue)');
    expect(row).toHaveTextContent('5 fixtures');
    expect(row).toHaveTextContent('13 looks');
    expect(row).toHaveTextContent('4 sequences');
    expect(open).toHaveTextContent('Shows › Clubs › Montreal');
    await user.click(within(row).getByRole('button', { name: 'Open Club night' }));
    expect(api.openShow).toHaveBeenCalledWith('club');
    expect(replaceProject).toHaveBeenCalledWith({ id: 'club', name: 'Club night' });
    expect(await screen.findByRole('status')).toHaveTextContent('Opened "Club night".');
  });

  it('marks the open show, which cannot be opened or deleted from the list', async () => {
    api.listShows.mockResolvedValue({ ...listing(), shows: [{ ...wedding, id: 'now', name: 'Demo light show' }] });
    renderFile();
    const row = (await screen.findAllByText('Demo light show')).at(-1).closest('li');
    expect(within(row).getByText('Open now')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('deletes a saved show only when confirmed', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    api.deleteShow.mockResolvedValue({ ok: true });
    renderFile();
    await user.click(await screen.findByRole('button', { name: 'Delete Wedding' }));
    expect(api.deleteShow).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete Wedding' }));
    await waitFor(() => expect(api.deleteShow).toHaveBeenCalledWith('wed'));
    confirm.mockRestore();
  });

  it('starts a new show and imports a file, explaining a file that is not a show', async () => {
    const user = userEvent.setup();
    api.newShow.mockResolvedValue({ id: 'n', name: 'Gala' });
    api.importProject.mockResolvedValue({ id: 'i', name: 'From a friend' });
    renderFile();
    await user.type(screen.getByLabelText('New show'), 'Gala');
    await user.click(screen.getByRole('button', { name: /Start/ }));
    await waitFor(() => expect(replaceProject).toHaveBeenCalledWith({ id: 'n', name: 'Gala' }));
    const input = screen.getByLabelText('Import a show file');
    await user.upload(input, new File(['{"name":"x"}'], 'show.json', { type: 'application/json' }));
    await waitFor(() => expect(replaceProject).toHaveBeenCalledWith({ id: 'i', name: 'From a friend' }));
    await user.upload(input, new File(['nope'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That file is not an Open DMX Stage show.');
  });

  it('says when there are no saved shows yet', async () => {
    api.listShows.mockResolvedValue({ current: { ...project, folder: null }, shows: [], folders: [] });
    renderFile();
    expect(await screen.findByText(/No saved shows yet/)).toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderFile();
    await screen.findByText('Club night');
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
