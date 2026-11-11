// Tests for the app shell: loading and error states, the welcome, navigation between every screen, and the banners.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/App.jsx';
import { api } from '../../src/api.js';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES, makeShow } from './fixtures.js';

vi.mock('../../src/api.js', () => ({
  api: {
    getProject: vi.fn(),
    getFixtureLibrary: vi.fn(),
    saveProject: vi.fn(),
    listOutputPorts: vi.fn(),
    saveOutputSettings: vi.fn(),
    getOutput: vi.fn(),
  },
}));

class MockSocket {
  static OPEN = 1;
  static instances = [];
  constructor() {
    this.readyState = 0;
    MockSocket.instances.push(this);
  }
  send() {}
  close() {}
}

beforeEach(() => {
  MockSocket.instances = [];
  vi.stubGlobal('WebSocket', MockSocket);
  vi.resetAllMocks();
  localStorage.clear();
  document.documentElement.dataset.theme = 'light';
  api.getProject.mockResolvedValue(makeShow());
  api.getFixtureLibrary.mockResolvedValue(BUILTIN_TYPES);
  api.saveProject.mockResolvedValue({});
  api.listOutputPorts.mockResolvedValue([]);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderApp() {
  const view = render(<App />);
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

describe('App', () => {
  it('shows a loading message, then the Home screen', async () => {
    let finish;
    api.getProject.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    await act(async () => {
      finish(makeShow());
      await Promise.resolve();
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Test show' })).toBeInTheDocument();
  });

  it('explains when the show cannot be loaded', async () => {
    api.getProject.mockRejectedValue(new Error('Server offline'));
    await renderApp();
    expect(screen.getByText(/Could not load the project: Server offline/)).toBeInTheDocument();
  });

  it('opens on the Home screen with the top bar and navigation', async () => {
    await renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'Test show' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByLabelText('Show name')).toHaveValue('Test show');
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['Home', 'Test show'],
    ['Looks', 'Looks'],
    ['Sequences', 'Sequences'],
    ['Perform', 'Perform'],
    ['Setup', 'Setup'],
    ['Fixtures', 'Fixtures'],
    ['Output', 'Output'],
    ['Lights', 'Lights'],
  ])('shows the %s screen from the navigation', async (button, heading) => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name: button }));
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: button })).toHaveAttribute('aria-current', 'page');
  });

  it('opens the search with Ctrl+K from anywhere, jumps to a screen, and closes it with Escape', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.keyboard('{Control>}k{/Control}');
    const box = await screen.findByRole('combobox');
    await user.type(box, 'perform{Enter}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Perform' })).toBeInTheDocument();
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renames the show from the top bar and shows it as unsaved until it is saved', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.type(screen.getByLabelText('Show name'), '!');
    expect(screen.getByLabelText('Show name')).toHaveValue('Test show!');
    expect(screen.getByText('Unsaved')).toBeInTheDocument();
  });

  it('puts "Untitled show" back when the name is emptied', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.clear(screen.getByLabelText('Show name'));
    expect(screen.getByLabelText('Show name')).toHaveValue('Untitled show');
  });

  it('switches the theme and remembers it', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('switch', { name: 'Dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('odmx-theme')).toBe('dark');
  });

  it('welcomes someone with an empty rig, once', async () => {
    api.getProject.mockResolvedValue(makeShow({ fixtures: [] }));
    const first = await renderApp();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    first.unmount();
    localStorage.setItem('odmx-welcomed', '1');
    await renderApp();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lets someone skip the welcome, remembers it, and lands on the Home screen', async () => {
    const user = userEvent.setup();
    api.getProject.mockResolvedValue(makeShow({ fixtures: [] }));
    await renderApp();
    await user.click(await screen.findByRole('button', { name: 'Skip for now' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('odmx-welcomed')).toBe('1');
    expect(screen.getByRole('heading', { level: 1, name: 'Test show' })).toBeInTheDocument();
  });

  it('does not welcome someone who already has lights', async () => {
    await renderApp();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('warns when the page and the server are different versions', async () => {
    await renderApp();
    const socket = MockSocket.instances[0];
    await act(async () => socket.onmessage({ data: JSON.stringify({ type: 'hello', version: 99 }) }));
    expect(screen.getByRole('alert')).toHaveTextContent('different versions');
  });

  it('shows a save error from the project', async () => {
    const user = userEvent.setup();
    api.saveProject.mockRejectedValue(new Error('Disk full'));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await renderApp();
      await user.type(screen.getByLabelText('Show name'), '!');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
      expect(screen.getByRole('alert')).toHaveTextContent('Disk full');
      expect(screen.getByText('Save failed')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('has no automated accessibility violations', async () => {
    const { container } = await renderApp();
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
