// Connection: choose how DMX leaves the app (simulator, USB cable, ENTTEC Pro, Art-Net, sACN) without env vars.
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../api.js';
import { ConnectionHelp, TAB_FOR_DRIVER } from './ConnectionHelp.jsx';
import { Icon } from './Icon.jsx';

const INTERFACES = [
  { id: 'mock', label: 'Simulator', hint: 'No hardware needed. Good for trying things out.' },
  {
    id: 'open-dmx',
    label: 'USB-DMX cable',
    hint: 'Passive FTDI cables, such as the DSD TECH SH-RS09B and the ENTTEC Open DMX USB.',
  },
  {
    id: 'enttec-pro',
    label: 'ENTTEC DMX USB Pro',
    hint: 'Interfaces with a built-in processor, including DMXKing ultraDMX.',
  },
  { id: 'artnet', label: 'Art-Net', hint: 'DMX over your network to an Art-Net node or lighting app.' },
  { id: 'sacn', label: 'sACN (E1.31)', hint: 'DMX over your network, multicast or to one device.' },
];

const DEFAULT_UNIVERSE = { artnet: 0, sacn: 1 };
const UNIVERSE_LIMITS = { artnet: [0, 32767], sacn: [1, 63999] };
const DRIVER_LABELS = Object.fromEntries(INTERFACES.map((entry) => [entry.id, entry.label]));

const isSerial = (driver) => driver === 'open-dmx' || driver === 'enttec-pro';
const isNetwork = (driver) => driver === 'artnet' || driver === 'sacn';

export function ConnectionPanel({ output }) {
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

  const handleUniverse = (rawValue) => {
    const [min, max] = UNIVERSE_LIMITS[form.driver] ?? [0, 63999];
    const value = Math.round(Number(rawValue));
    setForm({ ...form, universe: Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min });
  };

  const handleConnect = async () => {
    setIsBusy(true);
    setMessage(null);
    try {
      await api.saveOutputSettings(form);
      setMessage({ kind: 'ok', text: 'Connected. Output is now going to the selected interface.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    } finally {
      setIsBusy(false);
    }
  };

  const hint = INTERFACES.find((entry) => entry.id === form.driver)?.hint;
  const universeRange = form.driver === 'artnet' ? '0 to 32767' : '1 to 63999';

  return (
    <section className="card card-pad connection" aria-label="Connection">
      <div className="section-bar">
        <h2 className="section-title">Connection</h2>
        <div className="conn-actions">
          <button type="button" className="btn" onClick={() => setIsHelpOpen(true)}>
            <Icon name="help" size={16} />
            How to connect
          </button>
          <span className="pill" role="status">
            <span className={`dot ${output?.connected ? 'dot-ok' : 'dot-bad'}`} />
            {output?.connected
              ? `Active: ${DRIVER_LABELS[output.driver] ?? output.driver}`
              : (output?.error ?? 'Not connected')}
          </span>
        </div>
      </div>

      <div className="iface-list" role="group" aria-label="Interface type">
        {INTERFACES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="iface"
            aria-pressed={form.driver === entry.id}
            onClick={() => handleDriver(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <p className="view-sub">{hint}</p>

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
        <ConnectionHelp initialTab={TAB_FOR_DRIVER[form.driver]} onClose={() => setIsHelpOpen(false)} />
      ) : null}
    </section>
  );
}
