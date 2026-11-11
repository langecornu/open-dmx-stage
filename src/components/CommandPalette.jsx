// The search palette (Ctrl or Command + K): type to find a screen, a look, a sequence or an action, and run it with
// Enter. It is how a person who knows what they want gets there without the mouse.
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { filterCommands } from '../utils/commands.js';
import { Icon } from './Icon.jsx';

export function CommandPalette({ isOpen, onClose, commands, context, onRun }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const opener = useRef(null);
  const listId = useId();

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
  const active = Math.min(activeIndex, Math.max(0, results.length - 1));

  // Remember what had focus, so closing the palette puts it back there.
  useEffect(() => {
    if (isOpen) {
      opener.current = document.activeElement;
      inputRef.current?.focus();
      return () => {
        if (opener.current instanceof HTMLElement) {
          opener.current.focus();
        }
      };
    }
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active, results]);

  if (!isOpen) {
    return null;
  }

  const close = () => {
    setQuery('');
    setActiveIndex(0);
    onClose();
  };
  const runCommand = (command) => {
    close();
    onRun?.(command);
    command.run(context);
  };
  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((active + 1) % Math.max(1, results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((active - 1 + results.length) % Math.max(1, results.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (results[active]) {
        runCommand(results[active]);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  let lastGroup = null;
  return (
    // The backdrop only catches a click outside the dialog; the keyboard closes the palette with Escape.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search">
        <div className="palette-input-row">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className="palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
            aria-label="Search screens, looks, sequences and actions"
            placeholder="Search screens, looks, sequences and actions…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-list" id={listId} role="listbox" aria-label="Results" ref={listRef}>
          {results.length === 0 ? (
            <li className="palette-empty" role="presentation">
              Nothing matches &ldquo;{query}&rdquo;
            </li>
          ) : null}
          {results.map((command, index) => {
            const showGroup = command.group !== lastGroup;
            lastGroup = command.group;
            return (
              <li key={command.id} role="presentation">
                {showGroup ? <div className="palette-group">{command.group}</div> : null}
                <div
                  id={`${listId}-${command.id}`}
                  role="option"
                  aria-selected={index === active}
                  tabIndex={-1}
                  className="palette-option"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => runCommand(command)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      runCommand(command);
                    }
                  }}
                >
                  <span className="palette-label">{command.label}</span>
                  <span className="palette-hint">{command.hint}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>Enter</kbd> to run
          </span>
        </div>
      </div>
    </div>
  );
}
