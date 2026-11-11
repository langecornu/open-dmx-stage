// Component tests for "Follow the music": choosing what to listen to, the status, the meter and errors.
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SoundPanel } from '../../src/components/SoundPanel.jsx';
import { accessibilityViolations } from './axe.js';
import { createStream, installFakeAudio, musicWindows } from './audioFakes.js';

let audio;
let send;

beforeEach(() => {
  audio = installFakeAudio({
    devices: [
      { kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in microphone' },
      { kind: 'audioinput', deviceId: 'loop-2', label: 'BlackHole 2ch' },
    ],
  });
  send = vi.fn();
});
afterEach(() => {
  audio.uninstall();
});

async function renderPanel() {
  const view = render(<SoundPanel send={send} />);
  await act(async () => {});
  return view;
}

describe('SoundPanel', () => {
  it('explains what it does and that the sound stays in the page', async () => {
    await renderPanel();
    expect(screen.getByRole('region', { name: 'Follow the music' })).toBeInTheDocument();
    expect(screen.getByText(/never recorded or sent anywhere/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Not listening.');
    expect(screen.getByRole('button', { name: 'Start listening' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('listens to the microphone, and shows that it is waiting for a steady beat', async () => {
    const user = userEvent.setup();
    await renderPanel();
    await user.click(screen.getByRole('button', { name: 'Start listening' }));
    expect(audio.mediaDevices.getUserMedia).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Listening… waiting for a steady beat.');
    expect(screen.getByRole('button', { name: 'Stop listening' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows what it hears while it waits, so a person can tell it is working', async () => {
    const user = userEvent.setup();
    await renderPanel();
    await user.click(screen.getByRole('button', { name: 'Start listening' }));
    expect(screen.getByText(/Strongest rhythm: none yet/)).toBeInTheDocument();
    act(() => audio.feed(musicWindows({ seconds: 14, intervalMs: 500 })));
    expect(
      screen.getByText(/Heard \d+ beats\. Strongest rhythm: 1(19|20|21)(\.\d)? bpm, \d+% steady\./),
    ).toBeInTheDocument();
  });

  it('shows the tempo it follows, a level meter, and sets the tempo for the lights', async () => {
    const user = userEvent.setup();
    await renderPanel();
    await user.click(screen.getByRole('button', { name: 'Start listening' }));
    act(() => audio.feed(musicWindows({ seconds: 14, intervalMs: 500 })));
    expect(screen.getByRole('status')).toHaveTextContent(/Following the beat: 1(19|20|21)(\.\d)? beats per minute\./);
    expect(screen.getByText(/^1(19|20|21)(\.\d)? bpm$/)).toBeInTheDocument();
    const meter = screen.getByRole('meter', { name: 'Sound level' });
    expect(Number(meter.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(0);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'tempo', sync: true }));
  });

  it('stops listening from the same button, and lets the choices be changed again', async () => {
    const user = userEvent.setup();
    await renderPanel();
    await user.click(screen.getByRole('button', { name: 'Start listening' }));
    expect(screen.getByLabelText('Listen to')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Stop listening' }));
    expect(screen.getByRole('status')).toHaveTextContent('Not listening.');
    expect(screen.getByLabelText('Listen to')).toBeEnabled();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });

  it('lets you choose a microphone when there are several, and uses it', async () => {
    const user = userEvent.setup();
    await renderPanel();
    const select = screen.getByLabelText('Microphone');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Default', 'Built-in microphone', 'BlackHole 2ch']);
    await user.selectOptions(select, 'loop-2');
    await user.click(screen.getByRole('button', { name: 'Start listening' }));
    expect(audio.mediaDevices.getUserMedia.mock.calls[0][0].audio.deviceId).toEqual({ exact: 'loop-2' });
  });

  it('offers no microphone choice when there is only one', async () => {
    audio.mediaDevices.enumerateDevices.mockResolvedValue([
      { kind: 'audioinput', deviceId: 'only', label: 'Only mic' },
    ]);
    await renderPanel();
    expect(screen.queryByLabelText('Microphone')).not.toBeInTheDocument();
  });

  it('listens to a tab instead, and explains how to share its sound', async () => {
    const user = userEvent.setup();
    await renderPanel();
    await user.selectOptions(screen.getByLabelText('Listen to'), "A browser tab's sound (best for music in Chrome)");
    expect(screen.getByText(/Also share tab audio/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Microphone')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start listening' }));
    expect(audio.mediaDevices.getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: true });
    expect(screen.queryByText(/Also share tab audio/)).not.toBeInTheDocument();
  });

  it('shows why listening could not start', async () => {
    const user = userEvent.setup();
    audio.mediaDevices.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    await renderPanel();
    await user.click(screen.getByRole('button', { name: 'Start listening' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('did not allow the microphone');
    expect(screen.getByRole('button', { name: 'Start listening' })).toBeInTheDocument();
  });

  it('shows that it is waiting for the browser to allow the sound', async () => {
    const user = userEvent.setup();
    let allow;
    audio.mediaDevices.getUserMedia.mockReturnValueOnce(new Promise((resolve) => (allow = resolve)));
    await renderPanel();
    await user.click(screen.getByRole('button', { name: 'Start listening' }));
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for the browser to allow the sound');
    await act(async () => allow(createStream()));
    expect(screen.getByRole('status')).toHaveTextContent('Listening');
  });

  it('has no automated accessibility violations', async () => {
    const user = userEvent.setup();
    const { container } = await renderPanel();
    await user.click(screen.getByRole('button', { name: 'Start listening' }));
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
