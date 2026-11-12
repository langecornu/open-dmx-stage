// The show list, opened from the Shows button beside the show name: open another show, start a new one, save this one
// under another name, delete one, or take a show to or from a file. The show being worked on always saves itself;
// opening another puts it back in the list, so nothing is lost.
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../api.js';
import { Icon } from './Icon.jsx';

const plural = (count, word) => `${count} ${count === 1 ? word : `${word}s`}`;

function describe(show) {
  return [
    plural(show.lights, 'light'),
    plural(show.looks, 'look'),
    plural(show.sequences, 'sequence'),
    show.venues > 1 ? plural(show.venues, 'venue') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function savedWhen(iso) {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A name field with a button, for New show and Save as. */
function NameForm({ label, button, placeholder, onSubmit, isBusy }) {
  const [name, setName] = useState('');
  return (
    <form
      className="shows-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) {
          onSubmit(name.trim());
          setName('');
        }
      }}
    >
      <label className="field">
        {label}
        <input
          className="input"
          value={name}
          maxLength={80}
          placeholder={placeholder}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <button type="submit" className="btn" disabled={isBusy || !name.trim()}>
        {button}
      </button>
    </form>
  );
}

/**
 * @param {{ isOpen: boolean, onClose: () => void, project: any, flush: () => Promise<void>,
 *   onReplace: (project: any) => void }} props
 */
export function ShowsDialog({ isOpen, onClose, project, flush, onReplace }) {
  const closeRef = useRef(null);
  const opener = useRef(null);
  const [shows, setShows] = useState(/** @type {any[] | null} */ (null));
  const [message, setMessage] = useState(/** @type {{ kind: 'ok' | 'error', text: string } | null} */ (null));
  const [isBusy, setIsBusy] = useState(false);
  // The latest close handler, so a new one from each render of the app does not reset the dialog.
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;

  const refresh = useCallback(async () => {
    try {
      setShows((await api.listShows()).shows);
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    setMessage(null);
    refresh();
    opener.current = document.activeElement;
    closeRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHandler.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (opener.current instanceof HTMLElement) {
        opener.current.focus();
      }
    };
  }, [isOpen, refresh]);

  // Every action saves pending edits first, so the show going back to the list has them.
  const run = async (action, done) => {
    setIsBusy(true);
    setMessage(null);
    try {
      await flush();
      const next = await action();
      if (next) {
        onReplace(next);
      }
      setMessage({ kind: 'ok', text: done(next) });
      await refresh();
    } catch (error) {
      setMessage({
        kind: 'error',
        text: error instanceof SyntaxError ? 'That file is not an Open DMX Stage show.' : error.message,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      await run(
        async () => api.importProject(JSON.parse(await file.text())),
        (next) => `Opened "${next.name}" from the file. "${project.name}" is in the list below.`,
      );
    }
  };

  if (!isOpen) {
    return null;
  }
  return (
    // The backdrop only catches a click outside the dialog; the keyboard closes it with Escape.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="palette shows" role="dialog" aria-modal="true" aria-labelledby="shows-title">
        <div className="shortcuts-head">
          <h2 className="section-title" id="shows-title">
            Shows
          </h2>
          <button ref={closeRef} type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="shows-body">
          <section className="shows-current" aria-label="Open now">
            <p className="eyebrow">Open now · saves by itself</p>
            <p className="shows-name">{project.name}</p>
            <p className="fixture-meta">
              {describe({
                lights: project.fixtures.length,
                looks: project.scenes.length,
                sequences: project.chases.length,
                venues: 1 + (project.venues?.length ?? 0),
              })}
            </p>
            <div className="toolbar">
              <a className="btn" href="/api/v1/project/export" download>
                <Icon name="down" size={16} />
                Export to a file
              </a>
              <label className="btn">
                <Icon name="upload" size={16} />
                Import a show file
                <input className="sr-only" type="file" accept=".json,application/json" onChange={handleImport} />
              </label>
            </div>
          </section>

          <div className="shows-forms">
            <NameForm
              label="Save as"
              button="Save as"
              placeholder={`${project.name} (copy)`}
              isBusy={isBusy}
              onSubmit={(name) =>
                run(
                  () => api.saveShowAs(name),
                  () => `Now working on "${name}". "${project.name}" stays in the list as it was.`,
                )
              }
            />
            <NameForm
              label="New show"
              button="Create"
              placeholder="Wedding, Club night…"
              isBusy={isBusy}
              onSubmit={(name) =>
                run(
                  () => api.newShow(name),
                  () => `Started "${name}". "${project.name}" is in the list below.`,
                )
              }
            />
          </div>

          {message ? (
            <p
              className={message.kind === 'error' ? 'error-banner' : 'view-sub'}
              role={message.kind === 'error' ? 'alert' : 'status'}
            >
              {message.text}
            </p>
          ) : null}

          <section aria-label="Your other shows">
            <p className="eyebrow">Your other shows</p>
            {shows === null ? <p className="fixture-meta">Loading…</p> : null}
            {shows?.length === 0 ? (
              <p className="fixture-meta">None yet. Save as or New show keeps this one here.</p>
            ) : null}
            <ul className="shows-list">
              {(shows ?? []).map((show) => (
                <li key={show.id} className="shows-row">
                  <Icon name="folder" />
                  <span className="shows-row-text">
                    <span className="shows-row-name">{show.name}</span>
                    <span className="fixture-meta">
                      {show.unreadable ? 'This file cannot be read' : describe(show)}
                      {show.savedAt ? ` · ${savedWhen(show.savedAt)}` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary btn-compact"
                    disabled={isBusy || show.unreadable}
                    aria-label={`Open ${show.name}`}
                    onClick={() =>
                      run(
                        () => api.openShow(show.id),
                        (next) => `Opened "${next.name}". "${project.name}" is in the list below.`,
                      )
                    }
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    disabled={isBusy}
                    aria-label={`Delete ${show.name}`}
                    onClick={() => {
                      if (window.confirm(`Delete "${show.name}"? This cannot be undone.`)) {
                        run(
                          async () => {
                            await api.deleteShow(show.id);
                            return null;
                          },
                          () => `Deleted "${show.name}".`,
                        );
                      }
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
