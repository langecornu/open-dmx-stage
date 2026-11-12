// Loads the project once, then autosaves edits with a short debounce and reports the save status.
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../api.js';

const SAVE_DELAY_MS = 500;

export function useProject() {
  const [project, setProject] = useState(null);
  const [library, setLibrary] = useState([]);
  const [saveStatus, setSaveStatus] = useState('saved');
  const [error, setError] = useState(null);
  const saveTimer = useRef(null);
  const latest = useRef(null);

  useEffect(() => {
    let isCurrent = true;
    Promise.all([api.getProject(), api.getFixtureLibrary()])
      .then(([loadedProject, loadedLibrary]) => {
        if (isCurrent) {
          latest.current = loadedProject;
          setProject(loadedProject);
          setLibrary(loadedLibrary);
        }
      })
      .catch((loadError) => {
        if (isCurrent) {
          setError(loadError.message);
        }
      });
    return () => {
      isCurrent = false;
      clearTimeout(saveTimer.current);
    };
  }, []);

  const persist = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await api.saveProject(latest.current);
      setSaveStatus('saved');
    } catch (saveError) {
      setSaveStatus('error');
      // The server moved to a newer show format while this page was open: only a reload brings the page up to date.
      setError(
        /schemaVersion/.test(saveError.message)
          ? 'The app was updated while this page was open, so this change could not be saved. Reload the page (your saved show is safe), then make the change again.'
          : saveError.message,
      );
    }
  }, []);

  // Saves any pending edit right away so the server sees it before a recall or chase start.
  const flush = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      await persist();
    }
  }, [persist]);

  const update = useCallback(
    (mutate) => {
      const next = mutate(latest.current);
      latest.current = next;
      setProject(next);
      setError(null);
      setSaveStatus('pending');
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        persist();
      }, SAVE_DELAY_MS);
    },
    [persist],
  );

  // Swaps in a project the server has already saved (an imported show), dropping any pending edit.
  const replace = useCallback((next) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = null;
    latest.current = next;
    setProject(next);
    setError(null);
    setSaveStatus('saved');
  }, []);

  return { project, library, update, flush, replace, saveStatus, error };
}
