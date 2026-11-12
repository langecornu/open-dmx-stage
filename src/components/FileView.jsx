// File: save the show you are working on into your list of shows, in a folder, and open another. The show also saves
// itself as you work; Save gives it a place in the list (and a name), and opening another show saves the open one back
// to its place first, so nothing is lost. The folders live in the app's own show list, not anywhere on the computer;
// Export puts a copy of the show anywhere you like.
import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../api.js';
import { Icon } from './Icon.jsx';

const plural = (count, word) => `${count} ${count === 1 ? word : `${word}s`}`;
const TOP = '';

function when(iso) {
  return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

/** "Clubs/Montreal" → "Shows › Clubs › Montreal". */
function folderPath(folder) {
  return ['Shows', ...(folder ? folder.split('/') : [])].join(' › ');
}

/**
 * The folders as a tree: each with its depth, in order, the top first.
 * @param {string[]} folders
 * @returns {{ path: string, name: string, depth: number }[]}
 */
export function folderTree(folders) {
  return [
    { path: TOP, name: 'Shows', depth: 0 },
    ...[...folders]
      .sort((a, b) => a.localeCompare(b))
      .map((folder) => ({ path: folder, name: folder.split('/').at(-1), depth: folder.split('/').length })),
  ];
}

function ShowDetails({ show }) {
  if (show.unreadable) {
    return <span className="fixture-meta">This file cannot be read</span>;
  }
  return (
    <span className="file-details">
      <span>
        <Icon name="pin" size={14} />
        {show.venue}
        {show.venues > 1 ? ` (+${show.venues - 1} more ${show.venues === 2 ? 'venue' : 'venues'})` : ''}
      </span>
      <span>{plural(show.lights, 'fixture')}</span>
      <span>{plural(show.looks, 'look')}</span>
      <span>{plural(show.sequences, 'sequence')}</span>
      {show.savedAt ? <span>saved {when(show.savedAt)}</span> : null}
    </span>
  );
}

/**
 * @param {{ project: any, flush: () => Promise<void>, replaceProject: (project: any) => void,
 *   update: (mutate: (project: any) => any) => void }} props
 */
export function FileView({ project, flush, replaceProject }) {
  const [list, setList] = useState(/** @type {{ current: any, shows: any[], folders: string[] } | null} */ (null));
  const [name, setName] = useState(project.name);
  const [folder, setFolder] = useState(TOP);
  const [newFolder, setNewFolder] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState(/** @type {{ kind: 'ok' | 'error', text: string } | null} */ (null));

  const refresh = useCallback(async () => {
    try {
      const next = await api.listShows();
      setList(next);
      return next;
    } catch (error) {
      setMessage({ kind: 'error', text: error.message });
      return null;
    }
  }, []);

  // Save starts from the show's name at the top, and from the folder it is already saved in.
  useEffect(() => {
    setName(project.name);
  }, [project.name, project.id]);
  useEffect(() => {
    refresh().then((next) => setFolder(next?.current.folder ?? TOP));
  }, [refresh, project.id]);

  const run = async (action, done) => {
    setIsBusy(true);
    setMessage(null);
    try {
      await flush();
      const result = await action();
      setMessage({ kind: 'ok', text: done(result) });
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

  const handleSave = (event) => {
    event.preventDefault();
    run(
      async () => {
        const { project: saved, folder: where } = await api.saveShow(name.trim(), folder);
        replaceProject(saved);
        return where;
      },
      (where) => `Saved "${name.trim()}" in ${folderPath(where)}.`,
    );
  };

  const handleNewFolder = (event) => {
    event.preventDefault();
    const path = folder ? `${folder}/${newFolder.trim()}` : newFolder.trim();
    run(
      async () => {
        await api.createShowFolder(path);
        setFolder(path);
        setNewFolder('');
        return path;
      },
      (made) => `Made the folder ${folderPath(made)}.`,
    );
  };

  const handleOpen = (show) =>
    run(
      async () => {
        const opened = await api.openShow(show.id);
        replaceProject(opened);
        return opened;
      },
      (opened) => `Opened "${opened.name}". "${project.name}" was saved to the list first.`,
    );

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      run(
        async () => {
          const opened = await api.importProject(JSON.parse(await file.text()));
          replaceProject(opened);
          return opened;
        },
        (opened) => `Opened "${opened.name}" from the file; it is in the list below.`,
      );
    }
  };

  const tree = useMemo(() => folderTree(list?.folders ?? []), [list]);
  const byFolder = useMemo(() => {
    const groups = new Map(tree.map((entry) => [entry.path, []]));
    for (const show of list?.shows ?? []) {
      groups.get(show.folder)?.push(show);
    }
    return groups;
  }, [list, tree]);
  const current = list?.current;

  return (
    <section className="view" aria-labelledby="file-title">
      <div className="view-header">
        <div>
          <h1 className="view-title" id="file-title">
            File
          </h1>
          <p className="view-sub">
            Your show saves itself as you work. Save it to your list of shows to keep it under a name, in a folder, and
            open another one any time.
          </p>
        </div>
      </div>

      {message ? (
        <p
          className={message.kind === 'error' ? 'error-banner' : 'view-sub file-message'}
          role={message.kind === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      ) : null}

      <section className="card card-pad file-card" aria-labelledby="file-save-title">
        <h2 className="section-title" id="file-save-title">
          Save
        </h2>
        <p className="fixture-meta">
          {current?.folder === null || current?.folder === undefined
            ? `"${project.name}" is not in your list yet.`
            : `"${project.name}" is saved in ${folderPath(current.folder)}${current.savedAt ? `, ${when(current.savedAt)}` : ''}. Saving again updates it.`}
        </p>
        <form className="file-save" onSubmit={handleSave}>
          <label className="field">
            Name
            <input className="input" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </label>
          <fieldset className="file-tree">
            <legend>Save in</legend>
            {tree.map((entry) => (
              <label key={entry.path || 'top'} className="file-folder" style={{ paddingLeft: `${entry.depth * 20}px` }}>
                <input
                  type="radio"
                  name="folder"
                  value={entry.path}
                  checked={folder === entry.path}
                  onChange={() => setFolder(entry.path)}
                />
                <Icon name="folder" size={16} />
                {entry.name}
                <span className="fixture-meta">{plural(byFolder.get(entry.path)?.length ?? 0, 'show')}</span>
              </label>
            ))}
          </fieldset>
          <div className="toolbar">
            <button type="submit" className="btn btn-primary" disabled={isBusy || !name.trim()}>
              <Icon name="down" size={16} />
              Save in {folderPath(folder)}
            </button>
          </div>
        </form>
        <form className="toolbar" onSubmit={handleNewFolder}>
          <label className="field">
            New folder in {folderPath(folder)}
            <input
              className="input"
              value={newFolder}
              maxLength={60}
              placeholder="Clubs, Weddings 2027…"
              onChange={(event) => setNewFolder(event.target.value)}
            />
          </label>
          <button type="submit" className="btn" disabled={isBusy || !newFolder.trim()}>
            <Icon name="plus" size={16} />
            Make folder
          </button>
        </form>
      </section>

      <section className="card card-pad file-card" aria-labelledby="file-open-title">
        <h2 className="section-title" id="file-open-title">
          Open
        </h2>
        {list === null ? <p className="fixture-meta">Loading…</p> : null}
        {list && list.shows.length === 0 ? (
          <p className="fixture-meta">No saved shows yet. Save this one above to start your list.</p>
        ) : null}
        {tree
          .filter((entry) => (byFolder.get(entry.path)?.length ?? 0) > 0)
          .map((entry) => (
            <div key={entry.path || 'top'} className="file-group">
              <p className="eyebrow">
                <Icon name="folder" size={14} /> {folderPath(entry.path)}
              </p>
              <ul className="file-list">
                {byFolder.get(entry.path).map((show) => {
                  const isOpen = show.id === project.id;
                  return (
                    <li key={show.id} className="file-row" data-open={isOpen}>
                      <span className="file-row-text">
                        <span className="file-row-name">{show.name}</span>
                        <ShowDetails show={show} />
                      </span>
                      {isOpen ? (
                        <span className="badge badge-live">Open now</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-compact"
                            disabled={isBusy || show.unreadable}
                            aria-label={`Open ${show.name}`}
                            onClick={() => handleOpen(show)}
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-compact"
                            disabled={isBusy}
                            aria-label={`Delete ${show.name}`}
                            onClick={() => {
                              if (window.confirm(`Delete "${show.name}" from your list? This cannot be undone.`)) {
                                run(
                                  () => api.deleteShow(show.id),
                                  () => `Deleted "${show.name}".`,
                                );
                              }
                            }}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </section>

      <section className="card card-pad file-card" aria-labelledby="file-more-title">
        <h2 className="section-title" id="file-more-title">
          More
        </h2>
        <form
          className="toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            const field = /** @type {HTMLInputElement} */ (event.currentTarget.elements.namedItem('newShow'));
            const wanted = field.value.trim();
            if (wanted) {
              run(
                async () => {
                  const created = await api.newShow(wanted);
                  replaceProject(created);
                  field.value = '';
                  return created;
                },
                (created) => `Started "${created.name}". "${project.name}" was saved to the list first.`,
              );
            }
          }}
        >
          <label className="field">
            New show
            <input className="input" name="newShow" maxLength={80} placeholder="Wedding, Club night…" />
          </label>
          <button type="submit" className="btn" disabled={isBusy}>
            <Icon name="plus" size={16} />
            Start
          </button>
        </form>
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
          <span className="fixture-meta">A file can go anywhere: a USB stick, another computer, a backup.</span>
        </div>
      </section>
    </section>
  );
}
