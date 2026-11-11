// Connection: choose how DMX leaves the app (simulator, USB cable, ENTTEC Pro, Art-Net, sACN) without env vars.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../api.js';
import { DRIVER_LABELS } from '../utils/drivers.js';
import { DetectAdapter } from './DetectAdapter.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { TAB_FOR_DRIVER } from './guide/guideTabs.js';
import { Icon } from './Icon.jsx';
import { TestLights } from './TestLights.jsx';

// The guide is large and rarely opened, so it loads on demand rather than with the app.
const ConnectionHelp = lazy(() =>
  import('./ConnectionHelp.jsx').then((module) => ({ default: module.ConnectionHelp })),
);

const INTERFACES = [
  { id: 'mock', label: DRIVER_LABELS.mock, icon: 'flask', hint: 'No hardware needed. Good for trying things out.' },
  {
    id: 'open-dmx',
    label: DRIVER_LABELS['open-dmx'],
    icon: 'usb',
    hint: 'Passive FTDI cables, such as the DSD TECH SH-RS09B and the ENTTEC Open DMX USB.',
  },
  {
    id: 'enttec-pro',
    label: DRIVER_LABELS['enttec-pro'],
    icon: 'chip',
    hint: 'Interfaces with a built-in processor, including DMXKing ultraDMX.',
  },
  {
    id: 'artnet',
    label: DRIVER_LABELS.artnet,
    icon: 'network',
    hint: 'DMX over your network to an Art-Net node or lighting app.',
  },
  { id: 'sacn', label: DRIVER_LABELS.sacn, icon: 'radio', hint: 'DMX over your network, multicast or to one device.' },
];

const DEFAULT_UNIVERSE = { artnet: 0, sacn: 1 };
const UNIVERSE_LIMITS = { artnet: [0, 32767], sacn: [1, 63999] };

const isSerial = (driver) => driver === 'open-dmx' || driver === 'enttec-pro';
const isNetwork = (driver) => driver === 'artnet' || driver === 'sacn';

export function ConnectionPanel({ output, project, patch, live }) {
  const [form, setForm] = useState({ driver: 'mock', serialPath: '', host: '', universe: 0 });
  const [ports, setPorts] = useState([]);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const hasLoadedSettings = useRef(false);

  useEffect(() => {
    if (output?.settings && !hasLoadedSettings.current) {
      hasLoadedSettings.current = true;
      setForm({ ...output.settings });
    }
  }, [output]);

  const refreshPorts = useCallback(async () => {
    try {
      setPorts(await api.listOutputPorts());
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    }
  }, []);

  useEffect(() => {
    refreshPorts();
  }, [refreshPorts]);

  // Re-selecting the current interface keeps what was typed; choosing a different one starts from its default universe.
  const handleDriver = (driver) =>
    setForm((current) =>
      current.driver === driver ? current : { ...current, driver, universe: DEFAULT_UNIVERSE[driver] ?? 0 },
    );

  const clampUniverse = (value) => {
    const [min, max] = UNIVERSE_LIMITS[form.driver] ?? [0, 63999];
    const rounded = Math.round(Number(value));
    return Number.isFinite(rounded) && value !== '' ? Math.min(max, Math.max(min, rounded)) : min;
  };

  // Let the person type freely (including clearing the field); the range is enforced when they leave the field.
  const handleUniverse = (rawValue) => setForm({ ...form, universe: rawValue === '' ? '' : Number(rawValue) });
  const handleUniverseBlur = () => setForm({ ...form, universe: clampUniverse(form.universe) });

  // Detection suggests an interface; select it for the person so they only need to press Connect.
  const handleDetected = (result) => setForm((current) => ({ ...current, driver: result.suggestedInterface }));

  const handleConnect = async () => {
    setIsBusy(true);
    setMessage(null);
    try {
      await api.saveOutputSettings({ ...form, universe: clampUniverse(form.universe) });
      setMessage({ kind: 'ok', text: 'Connected. Output is now going to the selected interface.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    } finally {
      setIsBusy(false);
    }
  };

  const universeRange = form.driver === 'artnet' ? '0 to 32767' : '1 to 63999';

  return (
    <section className="card card-pad connection" aria-label="Connection">
      <div className="section-bar">
        <h2 className="section-title">Connection</h2>
        <div className="conn-actions">
          <TestLights project={project} patch={patch} live={live} />
          <button type="button" className="btn" onClick={() => setIsHelpOpen(true)}>
            <Icon name="help" size={16} />
            How to connect
          </button>
          <span className="pill" role="status">
            <span className={`dot ${output?.connected ? 'dot-ok' : 'dot-bad'}`} />
            {output?.connected
              ? `Using: ${DRIVER_LABELS[output.driver] ?? output.driver}`
              : (output?.error ?? 'Not connected')}
          </span>
        </div>
      </div>

      <div className="iface-grid" role="group" aria-label="Interface type">
        {INTERFACES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="iface-card"
            aria-pressed={form.driver === entry.id}
            aria-label={entry.label}
            aria-describedby={`iface-hint-${entry.id}`}
            onClick={() => handleDriver(entry.id)}
          >
            <span className="iface-icon" aria-hidden="true">
              <Icon name={entry.icon} size={20} />
            </span>
            <span className="iface-title" aria-hidden="true">
              {entry.label}
            </span>
            <span className="iface-hint" id={`iface-hint-${entry.id}`}>
              {entry.hint}
            </span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        {isSerial(form.driver) ? (
          <>
            <label className="field">
              Serial port
              <select
                className="select"
                value={form.serialPath}
                onChange={(event) => setForm({ ...form, serialPath: event.target.value })}
              >
                <option value="">Choose a port…</option>
                {ports.map((port) => (
                  <option key={port.path} value={port.path}>
                    {port.path}
                    {port.vendorId === '0403' ? ' · FTDI cable' : ''}
                    {port.manufacturer ? ` · ${port.manufacturer}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn" onClick={refreshPorts}>
              Refresh
            </button>
            <DetectAdapter serialPath={form.serialPath} onResult={handleDetected} />
          </>
        ) : null}
        {isNetwork(form.driver) ? (
          <>
            <label className="field">
              Send to (optional IP address)
              <input
                className="input"
                value={form.host}
                maxLength={253}
                placeholder={form.driver === 'artnet' ? 'broadcast (or 192.168.1.50)' : 'multicast (or 192.168.1.50)'}
                onChange={(event) => setForm({ ...form, host: event.target.value.trim() })}
              />
            </label>
            <label className="field">
              Universe ({universeRange})
              <input
                className="input input-narrow"
                type="number"
                min={form.driver === 'artnet' ? 0 : 1}
                max={form.driver === 'artnet' ? 32767 : 63999}
                value={form.universe}
                onChange={(event) => handleUniverse(event.target.value)}
                onBlur={handleUniverseBlur}
              />
            </label>
          </>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleConnect}
          disabled={isBusy || (isSerial(form.driver) && form.serialPath === '')}
        >
          {isBusy ? 'Connecting…' : form.driver === 'mock' ? 'Use simulator' : 'Connect'}
        </button>
      </div>

      {message ? (
        <p
          className={message.kind === 'error' ? 'error-banner' : 'view-sub'}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      ) : null}
      {isHelpOpen ? (
        <ErrorBoundary label="the guide">
          <Suspense fallback={null}>
            <ConnectionHelp initialTab={TAB_FOR_DRIVER[form.driver]} onClose={() => setIsHelpOpen(false)} />
          </Suspense>
        </ErrorBoundary>
      ) : null}
    </section>
  );
}
