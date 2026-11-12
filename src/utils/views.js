// The screens of the app, in navigation order, with the group each belongs to in the sidebar.

/** @type {{ id: string, label: string, icon: string, group: 'Show' | 'Rig', summary: string }[]} */
export const VIEWS = [
  { id: 'home', label: 'Home', icon: 'home', group: 'Show', summary: 'Status, quick launch and next steps' },
  { id: 'control', label: 'Lights', icon: 'control', group: 'Show', summary: 'Colour and brightness by hand' },
  { id: 'scenes', label: 'Looks', icon: 'scenes', group: 'Show', summary: 'Save and recall looks' },
  { id: 'chases', label: 'Sequences', icon: 'chases', group: 'Show', summary: 'Chain looks into a show' },
  { id: 'perform', label: 'Perform', icon: 'bolt', group: 'Show', summary: 'Run the show with big pads' },
  { id: 'ai', label: 'AI shows', icon: 'sparkle', group: 'Show', summary: 'Let AI design looks and sequences' },
  { id: 'patch', label: 'Setup', icon: 'patch', group: 'Rig', summary: 'Your lights and their addresses' },
  { id: 'fixtures', label: 'Fixtures', icon: 'sliders', group: 'Rig', summary: 'Find or describe a light' },
  { id: 'monitor', label: 'Output', icon: 'monitor', group: 'Rig', summary: 'Connect and see what is sent' },
  { id: 'settings', label: 'Settings', icon: 'gear', group: 'Rig', summary: 'Your Anthropic API key for AI shows' },
];

export const GROUPS = ['Show', 'Rig'];
