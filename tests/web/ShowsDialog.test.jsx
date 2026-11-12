// Component tests for the show list: what is open now, the other shows, and opening, starting, saving as, deleting and
// importing shows, each after saving pending edits.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShowsDialog } from '../../src/components/ShowsDialog.jsx';
import { accessibilityViolations } from './axe.js';

vi.mock('../../src/api.js', () => ({
  api: {
    listShows: vi.fn(),
    openShow: vi.fn(),
    newShow: vi.fn(),
    saveShowAs: vi.fn(),
    deleteShow: vi.fn(),
    importProject: vi.fn(),
  },
}));
const { api } = await import('../../src/api.js');

const project = {
  id: 'now',
  name: 'Demo light show',
  fixtures: [{ id: 'f' }],
  scenes: [{ id: 's' }, { id: 't' }],
  chases: [],
  venues: [{ id: 'v' }],
};
const club = {
  id: 'club',
  name: 'Club night',
  savedAt: '2026-11-01T20:00:00.000Z',
  lights: 4,
  looks: 9,
  sequences: 2,
  venues: 1,
};

let flush;
let onReplace;

function renderDialog() {
  flush = vi.fn().mockResolvedValue(undefined);
  onReplace = vi.fn();
  return render(<ShowsDialog isOpen onClose={vi.fn()} project={project} flush={flush} onReplace={onReplace} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listShows.mockResolvedValue({ current: {}, shows: [club] });
});
afterEach(() => vi.restoreAllMocks());

describe('ShowsDialog', () => {
  it('shows what is open now and the other shows', async () => {
    renderDialog();
    const now = screen.getByRole('region', { name: 'Open now' });
    expect(now).toHaveTextContent('Demo light show');
    expect(now).toHaveTextContent('1 light · 2 looks · 0 sequences · 2 venues');
    const others = screen.getByRole('region', { name: 'Your other shows' });
    expect(await within(others).findByText('Club night')).toBeInTheDocument();
    expect(others).toHaveTextContent('4 lights · 9 looks · 2 sequences');
  });

  it('opens another show after saving pending edits, and swaps it in', async () => {
    const user = userEvent.setup();
    api.openShow.mockResolvedValue({ id: 'club', name: 'Club night' });
    renderDialog();
    await user.click(await screen.findByRole('button', { name: 'Open Club night' }));
    await waitFor(() => expect(onReplace).toHaveBeenCalledWith({ id: 'club', name: 'Club night' }));
    expect(flush).toHaveBeenCalled();
    expect(api.openShow).toHaveBeenCalledWith('club');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Opened "Club night". "Demo light show" is in the list below.',
    );
  });

  it('saves under another name and starts a new show', async () => {
    const user = userEvent.setup();
    api.saveShowAs.mockResolvedValue({ id: 'copy', name: 'Summer' });
    api.newShow.mockResolvedValue({ id: 'new', name: 'Wedding' });
    renderDialog();
    expect(screen.getByRole('button', { name: 'Save as' })).toBeDisabled();
    await user.type(screen.getByLabelText('Save as'), 'Summer');
    await user.click(screen.getByRole('button', { name: 'Save as' }));
    await waitFor(() => expect(api.saveShowAs).toHaveBeenCalledWith('Summer'));
    await user.type(screen.getByLabelText('New show'), 'Wedding');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onReplace).toHaveBeenLastCalledWith({ id: 'new', name: 'Wedding' }));
  });

  it('deletes a show only when confirmed', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    api.deleteShow.mockResolvedValue({ ok: true });
    renderDialog();
    await user.click(await screen.findByRole('button', { name: 'Delete Club night' }));
    expect(api.deleteShow).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete Club night' }));
    await waitFor(() => expect(api.deleteShow).toHaveBeenCalledWith('club'));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(onReplace).not.toHaveBeenCalled();
  });

  it('imports a show file as another show, and explains a file that is not a show', async () => {
    const user = userEvent.setup();
    api.importProject.mockResolvedValue({ id: 'gift', name: 'From a friend' });
    renderDialog();
    const input = screen.getByLabelText('Import a show file');
    await user.upload(input, new File(['{"name":"x"}'], 'show.json', { type: 'application/json' }));
    await waitFor(() => expect(onReplace).toHaveBeenCalledWith({ id: 'gift', name: 'From a friend' }));
    await user.upload(input, new File(['not json'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That file is not an Open DMX Stage show.');
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderDialog();
    await screen.findByText('Club night');
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
