// A test pattern for the lights: cycles every patched fixture through red, green, blue and white so you can see at a
// glance that the output, the cable and the DMX addresses are right. It uses the same manual (programmer) layer as the
// faders, and puts everything back when it stops.
import { useCallback, useEffect, useState } from 'react';

import { applyColor } from '../utils/colorControl.js';

export const TEST_COLOURS = [
  { name: 'red', rgb: [255, 0, 0] },
  { name: 'green', rgb: [0, 255, 0] },
  { name: 'blue', rgb: [0, 0, 255] },
  { name: 'white', rgb: [255, 255, 255] },
];
export const TEST_STEP_MS = 1200;

/**
 * @param {{ project?: { fixtures: unknown[] }, patch?: object, setChannels?: Function, send?: Function }} options
 *   everything is optional so the Connection card still works where there is no show to test
 * @returns {{ canRun: boolean, isRunning: boolean, colourName: string | null, toggle: () => void }}
 */
export function useTestPattern({ project, patch, setChannels, send }) {
  const [isRunning, setIsRunning] = useState(false);
  const [colourName, setColourName] = useState(null);
  const canRun = Boolean(project && patch && setChannels && send && project.fixtures.length > 0);

  useEffect(() => {
    if (!isRunning || !canRun) {
      return undefined;
    }
    let step = 0;
    const showNextColour = () => {
      const colour = TEST_COLOURS[step % TEST_COLOURS.length];
      const values = {};
      for (const fixture of project.fixtures) {
        const range = patch.fixtures.find((entry) => entry.id === fixture.id);
        Object.assign(values, applyColor(range, patch, colour.rgb, 1));
      }
      setChannels(values);
      setColourName(colour.name);
      step += 1;
    };
    showNextColour();
    const timer = setInterval(showNextColour, TEST_STEP_MS);
    return () => {
      clearInterval(timer);
      setColourName(null);
      send({ type: 'clearProgrammer' });
    };
  }, [isRunning, canRun, project, patch, setChannels, send]);

  const toggle = useCallback(() => setIsRunning((running) => !running), []);
  return { canRun, isRunning: isRunning && canRun, colourName, toggle };
}
