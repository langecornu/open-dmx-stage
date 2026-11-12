// Component tests for a channel's value ranges in the fixture editor: adding, editing, keeping each range the right way
// round, colours, fast-to-slow, overlaps and removing.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { CapabilityRanges } from '../../src/components/CapabilityRanges.jsx';
import { accessibilityViolations } from './axe.js';

let latest;
function Harness({ initial = [] }) {
  const [ranges, setRanges] = useState(initial);
  latest = ranges;
  return <CapabilityRanges channelName="Shutter" ranges={ranges} onChange={setRanges} />;
}

describe('CapabilityRanges', () => {
  it('explains a channel with no ranges, and adds each new range straight after the last', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText(/One thing over the whole range/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add range' }));
    expect(latest).toEqual([{ from: 0, to: 255, type: 'generic', label: '' }]);
    fireEvent.change(screen.getByLabelText('Range 1 ends at'), { target: { value: '9' } });
    await user.click(screen.getByRole('button', { name: 'Add range' }));
    expect(latest[1]).toEqual({ from: 10, to: 255, type: 'generic', label: '' });
  });

  it('edits a range, keeping values within 0 to 255 and the end never before the start', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ from: 0, to: 9, type: 'generic', label: '' }]} />);
    fireEvent.change(screen.getByLabelText('Range 1 starts at'), { target: { value: '300' } });
    expect(latest[0]).toMatchObject({ from: 255, to: 255 });
    fireEvent.change(screen.getByLabelText('Range 1 starts at'), { target: { value: 'abc' } });
    expect(latest[0].from).toBe(0);
    await user.selectOptions(screen.getByLabelText('What range 1 does'), 'shutter-open');
    await user.type(screen.getByLabelText('Name of range 1'), 'Open');
    expect(latest[0]).toMatchObject({ type: 'shutter-open', label: 'Open' });
  });

  it('gives a range a colour and takes it away, and marks a fast-to-slow range', async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ from: 0, to: 255, type: 'generic' }]} />);
    await user.click(screen.getByLabelText('Range 1 has a colour'));
    expect(latest[0].color).toBe('#ffffff');
    fireEvent.change(screen.getByLabelText('Colour of range 1'), { target: { value: '#ff0000' } });
    expect(latest[0].color).toBe('#ff0000');
    await user.click(screen.getByLabelText('Range 1 has a colour'));
    expect(latest[0].color).toBeUndefined();
    await user.click(screen.getByLabelText('Range 1 runs from fast to slow (high to low)'));
    expect(latest[0].reverse).toBe(true);
    await user.click(screen.getByLabelText('Range 1 runs from fast to slow (high to low)'));
    expect(latest[0].reverse).toBeUndefined();
  });

  it('says when ranges overlap, and removes a range', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { from: 0, to: 20, type: 'generic' },
          { from: 10, to: 255, type: 'generic' },
        ]}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent('Some ranges overlap');
    await user.click(screen.getByRole('button', { name: 'Remove range 1' }));
    expect(latest).toEqual([{ from: 10, to: 255, type: 'generic' }]);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('stops at 64 ranges', () => {
    render(
      <Harness initial={Array.from({ length: 64 }, (_, at) => ({ from: at * 4, to: at * 4 + 3, type: 'generic' }))} />,
    );
    expect(screen.getByRole('button', { name: 'Add range' })).toBeDisabled();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = render(<Harness initial={[{ from: 0, to: 255, type: 'generic', color: '#00ff00' }]} />);
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
