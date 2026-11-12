// The show on Setup: where to find File (save, open, new, import) and a quick export to a file.
import { Icon } from './Icon.jsx';

export function ShowFileCard({ onOpenShows }) {
  return (
    <section className="card card-pad show-file" aria-label="Your show file">
      <div>
        <h2 className="section-title">Your show</h2>
        <p className="view-sub">
          It saves by itself. Save it to your list of shows, open another, start a new one or import a file in{' '}
          <strong>File</strong>, in the sidebar or beside the show name at the top.
        </p>
      </div>
      <div className="toolbar">
        {onOpenShows ? (
          <button type="button" className="btn" onClick={onOpenShows}>
            <Icon name="folder" size={16} />
            Open File
          </button>
        ) : null}
        <a className="btn" href="/api/v1/project/export" download>
          <Icon name="down" size={16} />
          Export show
        </a>
      </div>
    </section>
  );
}
