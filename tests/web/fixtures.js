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
