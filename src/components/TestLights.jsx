// "Test lights" button: cycles all patched fixtures through red, green, blue and white to check the connection.
import { useTestPattern } from '../hooks/useTestPattern.js';
import { Icon } from './Icon.jsx';

export function TestLights({ project, patch, live }) {
  const { canRun, isRunning, colourName, toggle } = useTestPattern({
    project,
    patch,
    setChannels: live?.setChannels,
    send: live?.send,
  });
  return (
    <>
      <button
        type="button"
        className="btn"
        aria-pressed={isRunning}
        disabled={!canRun}
        title={canRun ? undefined : 'Add lights in Setup first'}
        onClick={toggle}
      >
        <Icon name={isRunning ? 'stop' : 'control'} size={16} />
        {isRunning ? 'Stop test' : 'Test lights'}
      </button>
      <span className="sr-only" role="status">
        {isRunning && colourName ? `Testing: ${colourName}` : ''}
      </span>
    </>
  );
}
