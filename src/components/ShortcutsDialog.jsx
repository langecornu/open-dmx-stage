// A cheat sheet of the keyboard shortcuts, opened with ? from anywhere (or from the search palette).
import { useEffect, useRef } from 'react';

const SECTIONS = [
  {
    title: 'Anywhere',
    rows: [
      { keys: ['Ctrl / ⌘', 'K'], text: 'Search screens, looks, sequences and actions' },
      { keys: ['?'], text: 'Show this list' },
    ],
  },
  {
    title: 'On Perform',
    rows: [
      { keys: ['1', '…', '0', 'Q', '…', 'L'], text: 'Play the look or sequence on that pad' },
      { keys: ['Space'], text: 'Blackout on or off' },
      { keys: ['Esc'], text: 'Stop the sequence' },
      { keys: ['[', ']'], text: 'Lower or raise the master by 10%' },
      { keys: ['.'], text: 'Tap the tempo' },
    ],
  },
];

export function ShortcutsDialog({ isOpen, onClose }) {
  const closeRef = useRef(null);
  const opener = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    opener.current = document.activeElement;
    closeRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (opener.current instanceof HTMLElement) {
        opener.current.focus();
      }
    };
  }, [isOpen, onClose]);

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
      <div className="palette shortcuts" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
        <div className="shortcuts-head">
          <h2 className="section-title" id="shortcuts-title">
            Keyboard shortcuts
          </h2>
          <button ref={closeRef} type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {SECTIONS.map((section) => (
          <section key={section.title} className="shortcuts-section" aria-label={section.title}>
            <h3 className="eyebrow">{section.title}</h3>
            <dl className="shortcuts-list">
              {section.rows.map((row) => (
                <div key={row.text} className="shortcuts-row">
                  <dt>
                    {row.keys.map((key, index) => (
                      <kbd key={`${key}-${index}`}>{key}</kbd>
                    ))}
                  </dt>
                  <dd>{row.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
