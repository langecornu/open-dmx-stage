// Component tests for the Connection card: interface choice, validation, saving, errors and the help guide.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConnectionPanel } from '../../src/components/ConnectionPanel.jsx';
import { accessibilityViolations } from './axe.js';

vi.mock('../../src/api.js', () => ({
  api: {
    listOutputPorts: vi.fn(),
    saveOutputSettings: vi.fn(),
  },
}));

const { api } = await import('../../src/api.js');

const OUTPUT = {
  driver: 'mock',
  connected: true,
  error: null,
  settings: { driver: 'mock', serialPath: '', host: '', universe: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  api.listOutputPorts.mockResolvedValue([
    { path: '/dev/tty.usbserial-A1', manufacturer: 'FTDI', vendorId: '0403' },
    { path: '/dev/tty.Bluetooth-Incoming-Port', manufacturer: '', vendorId: '' },
  ]);
  api.saveOutputSettings.mockResolvedValue({});
});

describe('ConnectionPanel', () => {
  it('lists the five interfaces with the active one pressed and a friendly status', async () => {
    render(<ConnectionPanel output={OUTPUT} />);
    const group = screen.getByRole('group', { name: 'Interface type' });
    expect(within(group).getAllByRole('button')).toHaveLength(5);
    expect(within(group).getByRole('button', { name: 'Simulator' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Active: Simulator');
    await screen.findByRole('button', { name: /How to connect/ });
  });

  it('keeps Connect disabled for a USB cable until a serial port is chosen, and labels FTDI cables', async () => {
    const user = userEvent.setup();
    render(<ConnectionPanel output={OUTPUT} />);
    await user.click(screen.getByRole('button', { name: 'USB-DMX cable' }));
    const connect = screen.getByRole('button', { name: 'Connect' });
    expect(connect).toBeDisabled();
    const select = await screen.findByRole('combobox', { name: 'Serial port' });
    await screen.findByRole('option', { name: /FTDI cable/ });
    await user.selectOptions(select, '/dev/tty.usbserial-A1');
    expect(connect).toBeEnabled();
  });

  it('sends the chosen network settings and confirms success', async () => {
    const user = userEvent.setup();
    render(<ConnectionPanel output={OUTPUT} />);
    await user.click(screen.getByRole('button', { name: 'Art-Net' }));
    await user.type(screen.getByLabelText(/Send to/), '192.168.1.50');
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() =>
      expect(api.saveOutputSettings).toHaveBeenCalledWith({
        driver: 'artnet',
        serialPath: '',
        host: '192.168.1.50',
        universe: 0,
      }),
    );
    expect(await screen.findByText(/Connected\./)).toBeInTheDocument();
  });

  it('shows the server message as an alert when connecting fails', async () => {
    const user = userEvent.setup();
    api.saveOutputSettings.mockRejectedValue(new Error('Another program is using this cable.'));
    render(<ConnectionPanel output={OUTPUT} />);
    await user.click(screen.getByRole('button', { name: 'Art-Net' }));
    await user.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Another program is using this cable.');
  });

  it('lets the universe be retyped and keeps it inside the valid range when leaving the field', async () => {
    const user = userEvent.setup();
    render(<ConnectionPanel output={OUTPUT} />);
    await user.click(screen.getByRole('button', { name: 'sACN (E1.31)' }));
    const universe = screen.getByLabelText(/Universe/);
    expect(universe).toHaveValue(1);
    await user.clear(universe);
    expect(universe).toHaveValue(null); // the field can be emptied while typing
    await user.type(universe, '0');
    await user.tab(); // leaving the field enforces sACN's minimum of 1
    expect(universe).toHaveValue(1);
    await user.clear(universe);
    await user.type(universe, '70000');
    await user.tab();
    expect(universe).toHaveValue(63999);
  });

  it('opens the guide on the page for the selected interface', async () => {
    const user = userEvent.setup();
    render(<ConnectionPanel output={OUTPUT} />);
    await user.click(screen.getByRole('button', { name: 'USB-DMX cable' }));
    await user.click(screen.getByRole('button', { name: /How to connect/ }));
    const dialog = await screen.findByRole('dialog', { name: 'How to connect your lights' });
    expect(within(dialog).getByRole('tab', { name: 'USB cable', selected: true })).toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<ConnectionPanel output={OUTPUT} />);
    await screen.findByRole('combobox', { hidden: true }).catch(() => undefined);
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
