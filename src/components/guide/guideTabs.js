// The pages of the connection guide, and which page opens for each output type. Kept apart from the modal so the
// connection panel can read the mapping without loading the guide itself (the modal is loaded on demand).
export const TAB_FOR_DRIVER = {
  mock: 'start',
  'open-dmx': 'usb',
  'enttec-pro': 'pro',
  artnet: 'artnet',
  sacn: 'sacn',
};
