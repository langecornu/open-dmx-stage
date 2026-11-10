// Component tests for the colour studio on its own: quick colours, the custom picker and the brightness slider.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ColorStudio, SWATCHES } from '../../src/components/ColorStudio.jsx';

function renderStudio(props = {}) {
  const handlers = { onColor: vi.fn(), onBrightness: vi.fn() };
  render(
    <ColorStudio
      color={[255, 32, 48]}
      brightness={0.5}
      liveColor={{ r: 128, g: 16, b: 24, css: 'rgb(128, 16, 24)' }}
      isInSync
      targetLabel="all fixtures"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('ColorStudio', () => {
  it('offers every quick colour as a labelled button', () => {
    renderStudio();
    for (const swatch of SWATCHES) {
      expect(screen.getByRole('button', { name: swatch.name })).toBeInTheDocument();
    }
  });

  it('sends the colour of the swatch that is pressed', async () => {
    const user = userEvent.setup();
    const { onColor } = renderStudio();
    await user.click(screen.getByRole('button', { name: 'Cyan' }));
    expect(onColor).toHaveBeenCalledWith([20, 220, 230]);
  });

  it('marks the chosen colour as pressed only while the lights still match it', () => {
    renderStudio();
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not mark any colour as pressed when the lights have been changed another way', () => {
    renderStudio({ isInSync: false });
    expect(screen.getByRole('button', { name: 'Red' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('converts a colour from the custom picker to red, green and blue', () => {
    const { onColor } = renderStudio();
    fireEvent.change(screen.getByLabelText('Pick any colour'), { target: { value: '#00ff80' } });
    expect(onColor).toHaveBeenCalledWith([0, 255, 128]);
  });

  it('sends the brightness as a fraction and shows it as a percentage', () => {
    const { onBrightness } = renderStudio();
    expect(screen.getByText('50%')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: /^Brightness/ }), { target: { value: '30' } });
    expect(onBrightness).toHaveBeenCalledWith(0.3);
  });

  it('says which fixtures it applies to', () => {
    renderStudio({ targetLabel: '2 selected' });
    expect(screen.getByText('Applies to: 2 selected')).toBeInTheDocument();
  });
});
