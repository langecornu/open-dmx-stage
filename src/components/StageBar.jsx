// The "on stage" bar: always visible, on every screen. It says what is playing, where it came from, and gives the one
// obvious button to stop it, so nobody has to hunt for it.
import { describeStage } from '../utils/stageStatus.js';
import { Icon } from './Icon.jsx';

const KIND_ICONS = { blackout: 'power', sequence: 'chases', look: 'scenes', manual: 'sliders', idle: 'control' };
const VIEW_NAMES = { chases: 'Sequences', scenes: 'Looks', control: 'Lights' };

export function StageBar({ engine, project, send, onNavigate }) {
  const stage = describeStage(engine, project);
  const isLive = stage.kind !== 'idle';

  return (
    <section className={`stage-bar stage-${stage.kind}`} aria-label="On stage">
      <div className="stage-main">
        <span className={`stage-icon${isLive ? ' is-live' : ''}`}>
          <Icon name={KIND_ICONS[stage.kind]} size={20} />
        </span>
        <div className="stage-text" role="status" aria-live="polite">
          <span className="stage-eyebrow">{stage.kind === 'blackout' ? 'Lights are off' : 'On stage'}</span>
          <span className="stage-title">{stage.title}</span>
          <span className="stage-detail">{stage.detail}</span>
        </div>
      </div>

      {stage.layers.length > 0 ? (
        <ul className="stage-layers" aria-label="Also running">
          {stage.layers.map((layer) => (
            <li key={layer.id} className="stage-layer">
              <span>{layer.text}</span>
              {layer.action ? (
                <button type="button" className="stage-link" onClick={() => send(layer.action.message)}>
                  {layer.action.label}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="stage-actions">
        {stage.view ? (
          <button type="button" className="btn btn-ghost" onClick={() => onNavigate(stage.view)}>
            Open {VIEW_NAMES[stage.view]}
          </button>
        ) : null}
        {stage.action ? (
          <button
            type="button"
            className={`btn ${stage.kind === 'blackout' ? 'btn-primary' : 'btn-stage-stop'}`}
            onClick={() => send(stage.action.message)}
          >
            <Icon name={stage.kind === 'blackout' ? 'power' : 'stop'} size={16} />
            {stage.action.label}
          </button>
        ) : null}
      </div>
    </section>
  );
}
