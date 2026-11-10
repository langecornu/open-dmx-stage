// Find a fixture in the Open Fixture Library (open-fixture-library.org) and copy its channel layout into your fixtures.
// The search words go to that site through this app's server; nothing from your show is sent.
import { useEffect, useRef, useState } from 'react';

import { api } from '../api.js';

export function OflSearch({ ownIds, onAdd }) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ status: 'idle', results: [], total: 0, searched: '' });
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [addingKey, setAddingKey] = useState(null);
  const latest = useRef(0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleSearch = async (event) => {
    event.preventDefault();
    const words = query.trim();
    if (words.length < 2) {
      setError('Type at least 2 letters to search.');
      return;
    }
    const ticket = latest.current + 1;
    latest.current = ticket;
    setError(null);
    setNotice(null);
    setState((current) => ({ ...current, status: 'loading' }));
    try {
      const found = await api.searchOpenFixtureLibrary(words);
      if (isMounted.current && ticket === latest.current) {
        setState({ status: 'done', results: found.results, total: found.total, searched: words });
      }
    } catch (caught) {
      if (isMounted.current && ticket === latest.current) {
        setError(caught.message);
        setState((current) => ({ ...current, status: 'idle' }));
      }
    }
  };

  const handleAdd = async (result) => {
    setAddingKey(result.key);
    setError(null);
    setNotice(null);
    try {
      const type = await api.importFromOpenFixtureLibrary(result.key);
      if (isMounted.current) {
        onAdd(type);
        setNotice(`Added ${result.name}. Find it under Your fixtures, then add it to your rig in Setup.`);
      }
    } catch (caught) {
      if (isMounted.current) {
        setError(caught.message);
      }
    } finally {
      if (isMounted.current) {
        setAddingKey(null);
      }
    }
  };

  return (
    <section className="card card-pad ofl-search" aria-label="Find a fixture online">
      <h2 className="section-title">Find a fixture online</h2>
      <p className="view-sub">
        Search the community-made{' '}
        <a href="https://open-fixture-library.org" target="_blank" rel="noreferrer">
          Open Fixture Library
        </a>{' '}
        and copy a light&apos;s channels into your fixtures. Only your search words are sent, and the app works fully
        without this.
      </p>
      <form className="toolbar" onSubmit={handleSearch}>
        <label className="field">
          Brand or model
          <input
            className="input"
            type="search"
            value={query}
            maxLength={80}
            placeholder="for example: uking gobo"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="submit" className="btn btn-primary">
          {state.status === 'loading' ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="view-sub" role="status">
          {notice}
        </p>
      ) : null}

      {state.status === 'done' && state.results.length === 0 ? (
        <p className="view-sub" role="status">
          Nothing found for &ldquo;{state.searched}&rdquo;. Try a shorter name, or just the brand.
        </p>
      ) : null}
      {state.results.length > 0 ? (
        <>
          <ul className="card list" aria-label="Search results">
            {state.results.map((result) => {
              const isOwned = ownIds.has(result.fixtureId);
              return (
                <li key={result.key} className="ofl-result">
                  <span>{result.name}</span>
                  <button
                    type="button"
                    className="btn"
                    aria-label={isOwned ? `${result.name} is already added` : `Add ${result.name}`}
                    disabled={isOwned || addingKey !== null}
                    onClick={() => handleAdd(result)}
                  >
                    {addingKey === result.key ? 'Adding…' : isOwned ? 'Added' : 'Add'}
                  </button>
                </li>
              );
            })}
          </ul>
          {state.total > state.results.length ? (
            <p className="view-sub">
              Showing {state.results.length} of {state.total}. Add more words to narrow it down.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
