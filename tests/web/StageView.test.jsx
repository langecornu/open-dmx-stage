// Component tests for the live stage view: one lamp per light, in the colour it is really sending.
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { buildPatch } from '../../shared/patch.js';
import { StageView } from '../../src/components/StageView.jsx';
import { frameStore } from '../../src/hooks/frameStore.js';
import { accessibilityViolations } from './axe.js';
import { BUILTIN_TYPES } from './fixtures.js';

function makeProject(count) {
  return {
    schemaVersion: 3,
    name: 'Test',
    fixtureTypes: [],
    fixtures: Array.from({ length: count }, (_, index) => ({
      id: `f${index}`,
      name: `Par ${index + 1}`,
      typeId: 'generic-rgb-par',
      mode: 0,
      address: 1 + index * 7,
    })),
    scenes: [],
    chases: [],
    groups: [],
  };
}

function renderStage(count) {
  const project = makeProject(count);
  return render(<StageView project={project} patch={buildPatch(project, BUILTIN_TYPES)} />);
}

afterEach(() => {
  act(() => frameStore.set(new Array(512).fill(0)));
});

describe('StageView', () => {
  it('draws one lamp per light, named, and dark when nothing is sent', () => {
    const { container } = renderStage(2);
    expect(screen.getByRole('list', { name: 'Live view of your lights' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('Par 1')).toBeInTheDocument();
    expect(container.querySelectorAll('.lamp[data-lit="true"]')).toHaveLength(0);
  });

  it('lights a lamp in the colour the light is sending, and follows the frame', () => {
    const { container } = renderStage(2);
    // The generic RGB par has red, green and blue on its first three channels.
    const frame = new Array(512).fill(0);
    frame[0] = 255;
    frame[1] = 255;
    frame[2] = 255;
    act(() => frameStore.set(frame));
    const lamps = container.querySelectorAll('.lamp');
    expect(lamps[0]).toHaveAttribute('data-lit', 'true');
    expect(lamps[0].style.getPropertyValue('--lamp')).toBe('rgb(255, 255, 255)');
    expect(lamps[1]).toHaveAttribute('data-lit', 'false');
    act(() => frameStore.set(new Array(512).fill(0)));
    expect(container.querySelector('.lamp')).toHaveAttribute('data-lit', 'false');
  });

  it('shows at most sixteen lamps and says how many more there are', () => {
    renderStage(20);
    expect(screen.getAllByText(/^Par \d+$/)).toHaveLength(16);
    expect(screen.getByText('+4 more')).toBeInTheDocument();
  });

  it('shows nothing for an empty rig', () => {
    const { container } = renderStage(0);
    expect(container).toBeEmptyDOMElement();
  });

  it('has no automated accessibility violations', async () => {
    const { container } = renderStage(3);
    expect(await accessibilityViolations(container)).toEqual([]);
  });
});
