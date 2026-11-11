// Component tests for the shared empty state.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from '../../src/components/EmptyState.jsx';
import { accessibilityViolations } from './axe.js';

describe('EmptyState', () => {
  it('shows the title and the hint', () => {
    render(<EmptyState title="Nothing here" hint="Add something." />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByText('Add something.')).toBeInTheDocument();
  });

  it('shows an icon only when one is given, and hides it from screen readers', () => {
    const { container, rerender } = render(<EmptyState title="A" hint="B" />);
    expect(container.querySelector('.empty-icon')).toBeNull();
    rerender(<EmptyState title="A" hint="B" icon="scenes" />);
    expect(container.querySelector('.empty-icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows an action passed as a child', () => {
    render(
      <EmptyState title="A" hint="B">
        <button type="button">Do it</button>
      </EmptyState>,
    );
    expect(screen.getByRole('button', { name: 'Do it' })).toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<EmptyState title="A" hint="B" icon="bolt" />);
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
