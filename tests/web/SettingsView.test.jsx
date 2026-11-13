// Component tests for the API key card: paste once, never shown again, replace or remove.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsView } from '../../src/components/SettingsView.jsx';
import { accessibilityViolations } from './axe.js';

vi.mock('../../src/api.js', () => ({
  api: { getAiSettings: vi.fn(), saveAiKey: vi.fn(), removeAiKey: vi.fn(), getNetwork: vi.fn() },
}));
const { api } = await import('../../src/api.js');

beforeEach(() => {
  vi.clearAllMocks();
  api.getAiSettings.mockResolvedValue({ hasKey: false, source: null });
  api.getNetwork.mockResolvedValue({
    httpsPort: 4443,
    fingerprint: 'AB:CD',
    validTo: '2027-12-14T00:00:00.000Z',
    addresses: ['https://192.168.1.117:4443', 'https://stage-mac.local:4443'],
  });
});
afterEach(() => vi.restoreAllMocks());

describe('SettingsView: phones and tablets', () => {
  it('lists the secure addresses to open on a phone, with the fingerprint to check the warning by', async () => {
    render(<SettingsView />);
    const card = await screen.findByRole('region', { name: 'Phones and tablets' });
    expect(await within(card).findByRole('link', { name: 'https://192.168.1.117:4443' })).toHaveAttribute(
      'href',
      'https://192.168.1.117:4443',
    );
    expect(card).toHaveTextContent('Fingerprint: AB:CD');
    expect(card).toHaveTextContent('Proceed');
  });

  it('says when the secure address is off', async () => {
    api.getNetwork.mockResolvedValue({ httpsPort: 0, fingerprint: null, validTo: null, addresses: [] });
    render(<SettingsView />);
    expect(await screen.findByText(/secure address is turned off/)).toBeInTheDocument();
  });
});

describe('SettingsView', () => {
  it('takes a pasted key in a hidden field, saves it, and then only says a key is saved', async () => {
    const user = userEvent.setup();
    api.getAiSettings.mockResolvedValue({ hasKey: false, source: null });
    api.saveAiKey.mockResolvedValue({ hasKey: true, source: 'saved' });
    render(<SettingsView />);
    const field = await screen.findByLabelText('Paste your API key');
    expect(field).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Save key' })).toBeDisabled();
    await user.type(field, 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz');
    await user.click(screen.getByRole('button', { name: 'Save key' }));
    expect(api.saveAiKey).toHaveBeenCalledWith('sk-ant-api03-abcdefghijklmnopqrstuvwxyz');
    expect(await screen.findByText('Key saved')).toBeInTheDocument();
    expect(screen.queryByLabelText('Paste your API key')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('abcdefghijklmnop');
  });

  it('shows why a key was refused, and keeps the field to try again', async () => {
    const user = userEvent.setup();
    api.getAiSettings.mockResolvedValue({ hasKey: false, source: null });
    api.saveAiKey.mockRejectedValue(new Error('Anthropic refused the API key. Paste a valid key in Settings.'));
    render(<SettingsView />);
    await user.type(await screen.findByLabelText('Paste your API key'), 'sk-ant-api03-wrongwrongwrongwrong');
    await user.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('refused the API key');
    expect(screen.getByLabelText('Paste your API key')).toBeInTheDocument();
  });

  it('replaces or removes a saved key, after asking', async () => {
    const user = userEvent.setup();
    api.getAiSettings.mockResolvedValue({ hasKey: true, source: 'saved' });
    api.removeAiKey.mockResolvedValue({ hasKey: false, source: null });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<SettingsView />);
    await user.click(await screen.findByRole('button', { name: 'Replace key' }));
    expect(screen.getByLabelText('Paste your API key')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: /Remove key/ }));
    await waitFor(() => expect(api.removeAiKey).toHaveBeenCalled());
    expect(await screen.findByLabelText('Paste your API key')).toBeInTheDocument();
  });

  it('says when the key is set on the server, with nothing to change here', async () => {
    api.getAiSettings.mockResolvedValue({ hasKey: true, source: 'environment' });
    render(<SettingsView />);
    expect(await screen.findByText(/ANTHROPIC_API_KEY/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace key' })).not.toBeInTheDocument();
  });

  it('has no automated accessibility violations', async () => {
    api.getAiSettings.mockResolvedValue({ hasKey: false, source: null });
    const { container } = render(<SettingsView />);
    await screen.findByLabelText('Paste your API key');
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
