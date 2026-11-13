// Settings: the Anthropic API key for AI shows. The key is pasted once and checked with Anthropic; after that the page
// only ever knows whether a key is saved. It cannot be read back, only replaced or removed.
import { useEffect, useState } from 'react';

import { api } from '../api.js';
import { Icon } from './Icon.jsx';

export function AiKeyCard() {
  const [status, setStatus] = useState(/** @type {{ hasKey: boolean, source: string | null } | null} */ (null));
  const [key, setKey] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {{ kind: 'ok' | 'error', text: string } | null} */ (null));

  useEffect(() => {
    api
      .getAiSettings()
      .then(setStatus)
      .catch((error) => setMessage({ kind: 'error', text: error.message }));
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    setIsBusy(true);
    setMessage(null);
    try {
      setStatus(await api.saveAiKey(key.trim()));
      setKey('');
      setIsEditing(false);
      setMessage({ kind: 'ok', text: 'Key checked with Anthropic and saved. It cannot be shown again.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm('Remove the saved API key? AI shows stop working until you add one again.')) {
      return;
    }
    try {
      setStatus(await api.removeAiKey());
      setMessage({ kind: 'ok', text: 'The key was removed.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    }
  };

  const showForm = status && (!status.hasKey || isEditing) && status.source !== 'environment';
  return (
    <section className="card card-pad ai-key" aria-labelledby="ai-key-title">
      <h2 className="section-title" id="ai-key-title">
        Anthropic API key
      </h2>
      <p className="view-sub">
        AI shows use Claude, by Anthropic, with your own API key: each generation is billed to your Anthropic account.
        Create a key in the Anthropic Console. The key stays on the computer running Open DMX Stage, is only ever sent
        to Anthropic, and cannot be read back here once saved.
      </p>
      {status === null && !message ? <p className="fixture-meta">Checking…</p> : null}
      {status?.hasKey && !isEditing ? (
        <div className="ai-key-saved">
          <span className="badge badge-live">
            <Icon name="check" size={14} />
            Key saved
          </span>
          {status.source === 'environment' ? (
            <span className="fixture-meta">Set on the server with ANTHROPIC_API_KEY; change it there.</span>
          ) : (
            <>
              <span className="fixture-meta">Hidden for your safety.</span>
              <button type="button" className="btn btn-compact" onClick={() => setIsEditing(true)}>
                Replace key
              </button>
              <button type="button" className="btn btn-ghost btn-compact" onClick={handleRemove}>
                <Icon name="trash" size={16} />
                Remove key
              </button>
            </>
          )}
        </div>
      ) : null}
      {showForm ? (
        <form className="toolbar" onSubmit={handleSave}>
          <label className="field ai-key-field">
            Paste your API key
            <input
              className="input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-…"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={isBusy || key.trim().length < 20}>
            {isBusy ? 'Checking…' : 'Save key'}
          </button>
          {isEditing ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setIsEditing(false);
                setKey('');
              }}
            >
              Cancel
            </button>
          ) : null}
        </form>
      ) : null}
      {message ? (
        <p
          className={message.kind === 'error' ? 'error-banner' : 'view-sub'}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

/** The secure (https) addresses to open on a phone or tablet, so the microphone and MIDI work there too. */
export function PhonesCard() {
  const [network, setNetwork] = useState(
    /** @type {{ httpsPort: number, fingerprint: string | null, validTo: string | null, addresses: string[] } | null} */ (
      null
    ),
  );
  const [error, setError] = useState(/** @type {string | null} */ (null));
  useEffect(() => {
    api
      .getNetwork()
      .then(setNetwork)
      .catch((loadError) => setError(loadError.message));
  }, []);
  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';

  return (
    <section className="card card-pad ai-key" aria-labelledby="phones-title">
      <h2 className="section-title" id="phones-title">
        Phones and tablets
      </h2>
      <p className="view-sub">
        Any device on your network can open the app. To also use the microphone (Follow the music) or a MIDI controller
        there, open its secure address: browsers only allow those on secure pages.
      </p>
      {isSecure ? (
        <p className="badge badge-live">
          <Icon name="check" size={14} />
          This page is secure
        </p>
      ) : null}
      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
      {network && network.httpsPort === 0 ? (
        <p className="fixture-meta">
          The secure address is turned off on this computer (HTTPS_PORT=0), or could not start. See the server log.
        </p>
      ) : null}
      {network && network.httpsPort > 0 ? (
        <>
          <ul className="phones-list">
            {network.addresses.map((address) => (
              <li key={address}>
                <a href={address}>{address}</a>
              </li>
            ))}
          </ul>
          <p className="fixture-meta">
            The first time, the browser warns that the connection is not private, because the certificate is made by
            this app rather than bought. Check the certificate&apos;s SHA-256 fingerprint matches the one below, then
            continue: in Chrome, choose Advanced and Proceed; in Safari, Show details and visit this website. Each
            device asks once.
          </p>
          <p className="fixture-meta phones-fingerprint">
            Fingerprint: <code>{network.fingerprint}</code>
            {network.validTo
              ? ` · renewed by itself before ${new Date(network.validTo).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
              : ''}
          </p>
        </>
      ) : null}
    </section>
  );
}

export function SettingsView() {
  return (
    <section className="view" aria-labelledby="settings-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="settings-title">
            Settings
          </h1>
          <p className="view-sub">Connections to other devices and services.</p>
        </div>
      </div>
      <PhonesCard />
      <AiKeyCard />
    </section>
  );
}
