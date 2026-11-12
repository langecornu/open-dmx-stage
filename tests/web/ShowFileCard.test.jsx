// Component tests for the show card on Setup: it leads to the show list and exports the show.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ShowFileCard } from '../../src/components/ShowFileCard.jsx';

describe('ShowFileCard', () => {
  it('offers the show as a download from the export endpoint', () => {
    render(<ShowFileCard onOpenShows={vi.fn()} />);
    const link = screen.getByRole('link', { name: /Export show/ });
    expect(link).toHaveAttribute('href', '/api/v1/project/export');
    expect(link).toHaveAttribute('download');
  });

  it('opens the show list', async () => {
    const user = userEvent.setup();
    const onOpenShows = vi.fn();
    render(<ShowFileCard onOpenShows={onOpenShows} />);
    await user.click(screen.getByRole('button', { name: /Shows/ }));
    expect(onOpenShows).toHaveBeenCalled();
  });
});
