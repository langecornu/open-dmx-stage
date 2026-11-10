// Component tests for the first-run welcome: three steps, automatic addressing, skipping.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Welcome } from '../../src/components/Welcome.jsx';
import { BUILTIN_TYPES } from './fixtures.js';

function renderWelcome() {
  const update = vi.fn();
  const onDone = vi.fn();
  const project = { schemaVersion: 2, name: 'Test', fixtureTypes: [], fixtures: [], scenes: [], chases: [] };
  render(
    <Welcome
      project={project}
      library={BUILTIN_TYPES}
      patch={{ channels: new Map(), fixtures: [] }}
      update={update}
      output={{ driver: 'mock', connected: true }}
      onDone={onDone}
    />,
  );
  return { update, onDone, project };
}

describe('Welcome', () => {
  it('walks through three steps and adds the chosen lights with consecutive DMX addresses', async () => {
    const user = userEvent.setup();
    const { update, onDone, project } = renderWelcome();
    expect(screen.getByRole('heading', { name: 'Welcome to Open DMX Stage' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Get started' }));

    await user.click(screen.getByRole('button', { name: 'More RGB LED par' }));
    await user.click(screen.getByRole('button', { name: 'More RGB LED par' }));
    await user.click(screen.getByRole('button', { name: 'More Dimmer' }));
    await user.click(screen.getByRole('button', { name: 'Add 3 lights' }));

    const fixtures = update.mock.calls[0][0](project).fixtures;
    // Lights are added in library order (the dimmer first), each after the one before.
    expect(fixtures.map((fixture) => fixture.address)).toEqual([1, 2, 5]);
    expect(fixtures.map((fixture) => fixture.typeId)).toEqual(['generic-dimmer', 'generic-rgb-par', 'generic-rgb-par']);

    expect(screen.getByRole('heading', { name: 'You are ready to light up' })).toBeInTheDocument();
    expect(screen.getByText(/simulator mode/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start lighting' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('keeps the add button disabled until at least one light is chosen, and lets people skip', async () => {
    const user = userEvent.setup();
    const { update, onDone } = renderWelcome();
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    expect(screen.getByRole('button', { name: 'Add lights' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('uses the singular for one channel', async () => {
    const user = userEvent.setup();
    renderWelcome();
    await user.click(screen.getByRole('button', { name: 'Get started' }));
    expect(screen.getByText('1 channel')).toBeInTheDocument();
    expect(screen.getByText('3 channels')).toBeInTheDocument();
  });

  it('is a real modal dialog, and Escape means skip rather than leaving a blank screen', () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const { onDone } = renderWelcome();
    expect(showModal).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole('dialog', { name: 'Welcome to Open DMX Stage' });
    const escape = new Event('cancel', { cancelable: true });
    fireEvent(dialog, escape);
    expect(escape.defaultPrevented, "the dialog is not closed behind the app's back").toBe(true);
    expect(onDone).toHaveBeenCalledTimes(1);
    showModal.mockRestore();
  });
});
