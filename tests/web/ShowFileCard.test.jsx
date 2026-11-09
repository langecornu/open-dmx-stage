// Component tests for exporting and importing a show: confirmation, success, and clear errors.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShowFileCard } from '../../src/components/ShowFileCard.jsx';

vi.mock('../../src/api.js', () => ({ api: { importProject: vi.fn() } }));
const { api } = await import('../../src/api.js');

const fileOf = (text, name = 'show.json') => new File([text], name, { type: 'application/json' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ShowFileCard', () => {
  it('offers the show as a download from the export endpoint', () => {
    render(<ShowFileCard onImported={vi.fn()} />);
    const link = screen.getByRole('link', { name: /Export show/ });
    expect(link).toHaveAttribute('href', '/api/v1/project/export');
    expect(link).toHaveAttribute('download');
  });

  it('asks before replacing the show, then imports and reports success', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    api.importProject.mockResolvedValue({ name: 'Imported show' });
    render(<ShowFileCard onImported={onImported} />);
    await user.upload(screen.getByLabelText(/Import show/), fileOf('{"name":"x"}'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('"show.json"'));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith({ name: 'Imported show' }));
    expect(screen.getByRole('status')).toHaveTextContent('Imported "Imported show".');
  });

  it('does nothing when the person declines to replace their show', async () => {
    const user = userEvent.setup();
    window.confirm.mockReturnValue(false);
    render(<ShowFileCard onImported={vi.fn()} />);
    await user.upload(screen.getByLabelText(/Import show/), fileOf('{}'));
    expect(api.importProject).not.toHaveBeenCalled();
  });

  it('explains a file that is not JSON, and shows the server message for a rejected show', async () => {
    const user = userEvent.setup();
    render(<ShowFileCard onImported={vi.fn()} />);
    await user.upload(screen.getByLabelText(/Import show/), fileOf('this is not json'));
    expect(await screen.findByRole('alert')).toHaveTextContent('That file is not an Open DMX Stage show.');

    api.importProject.mockRejectedValue(new Error('That show was saved by a newer version of Open DMX Stage.'));
    await user.upload(screen.getByLabelText(/Import show/), fileOf('{"schemaVersion":99}'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('newer version'));
  });
});
