import { vi } from 'vitest';

// Small fixture types used by browser tests, shaped like the server's built-in library.
const channel = (name, type) => ({ name, type, defaultValue: 0 });

export const BUILTIN_TYPES = [
  {
    id: 'generic-dimmer',
    manufacturer: 'Generic',
    name: 'Dimmer',
    modes: [{ name: '1 channel', channels: [channel('Intensity', 'intensity')] }],
  },
  {
    id: 'generic-rgb-par',
    manufacturer: 'Generic',
    name: 'RGB LED par',
    modes: [
      { name: '3 channel', channels: [channel('Red', 'red'), channel('Green', 'green'), channel('Blue', 'blue')] },
    ],
  },
];

// A small show for screen tests: two RGB pars (channels 1 to 3 and 4 to 6) and one dimmer (channel 10).
export const SHOW_PARS = [
  { id: 'a', name: 'Par 1', typeId: 'generic-rgb-par', mode: 0, address: 1 },
  { id: 'b', name: 'Par 2', typeId: 'generic-rgb-par', mode: 0, address: 4 },
  { id: 'c', name: 'Lamp', typeId: 'generic-dimmer', mode: 0, address: 10 },
];

export function makeShow(overrides = {}) {
  return {
    schemaVersion: 3,
    name: 'Test show',
    fixtureTypes: [],
    fixtures: SHOW_PARS,
    scenes: [],
    chases: [],
    groups: [],
    ...overrides,
  };
}

/** A stand-in for the live link: records what is sent and starts with a quiet engine. */
export function makeLive(engine = {}) {
  return {
    connected: true,
    output: { driver: 'mock', connected: true },
    send: vi.fn(),
    setChannels: vi.fn(),
    isVersionMismatch: false,
    engine: {
      master: 1,
      blackout: false,
      bpm: 120,
      effect: null,
      activeSceneId: null,
      activeChaseId: null,
      chaseStep: null,
      programmerChannels: [],
      ...engine,
    },
  };
}
