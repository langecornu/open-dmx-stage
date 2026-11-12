// The show on Setup: where to find the show list (open, new, save as, import) and a quick export to a file.
import { Icon } from './Icon.jsx';

export function ShowFileCard({ onOpenShows }) {
  return (
    <section className="card card-pad show-file" aria-label="Your show file">
      <div>
        <h2 className="section-title">Your show</h2>
        <p className="view-sub">
          It saves by itself. Open another show, start a new one, save a copy under another name or import a file from
          the show list, also under <strong>Shows</strong> beside the show name at the top.
        </p>
      </div>
      <div className="toolbar">
        {onOpenShows ? (
          <button type="button" className="btn" onClick={onOpenShows}>
            <Icon name="folder" size={16} />
            Shows…
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
