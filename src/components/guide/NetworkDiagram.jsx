// Diagram of network DMX: computer, network, node and lights.
// Keep in sync with docs/CONNECTION.md, which carries the same guide for readers outside the app.
import { ChainDiagram } from './ChainDiagram.jsx';

export function NetworkDiagram() {
  return (
    <ChainDiagram
      caption="Network DMX. The computer talks over your network (Ethernet is best) to a node, and the node outputs normal DMX to the lights."
      items={[
        { title: 'Computer', sub: 'Open DMX Stage', accent: true },
        { title: 'Router or switch', sub: 'your network' },
        { title: 'DMX node', sub: 'Art-Net or sACN' },
        { title: 'Lights', sub: 'DMX chain' },
      ]}
      links={['Network', 'Network', 'DMX']}
    />
  );
}
