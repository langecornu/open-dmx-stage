// Export the show to a file and import one back: the user's way to back up, move or restore a show.
import { useState } from 'react';

import { api } from '../api.js';
import { Icon } from './Icon.jsx';

export function ShowFileCard({ onImported }) {
  const [message, setMessage] = useState(null);

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    const replace = window.confirm(
      `Replace your current show with "${file.name}"? Export your current show first if you want to keep it.`,
    );
    if (!replace) {
      return;
    }
    try {
      const imported = await api.importProject(JSON.parse(await file.text()));
      onImported(imported);
      setMessage({ kind: 'ok', text: `Imported "${imported.name}".` });
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof SyntaxError ? 'That file is not an Open DMX Stage show.' : error.message,
      });
    }
  };

  return (
    <section className="card card-pad show-file" aria-label="Your show file">
      <div>
        <h2 className="section-title">Your show</h2>
        <p className="view-sub">Save a copy to back it up or move it to another computer, or load one back in.</p>
      </div>
      <div className="toolbar">
        <a className="btn" href="/api/v1/project/export" download>
          <Icon name="down" size={16} />
          Export show
        </a>
        <label className="btn">
          <Icon name="upload" size={16} />
          Import show
          <input className="sr-only" type="file" accept=".json,application/json" onChange={handleImport} />
        </label>
      </div>
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
