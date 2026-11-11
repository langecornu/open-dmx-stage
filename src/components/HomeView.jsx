// Home: the first screen. It answers "is everything ready, and what can I do now?": the state of the output and the
// rig, quick launch pads for the looks and sequences, and a short checklist for a show that is not finished yet.
import { DRIVER_LABELS } from '../utils/drivers.js';
import { Icon } from './Icon.jsx';
import { PerformTile } from './PerformTile.jsx';
import { buildPerformItems } from '../utils/performItems.js';
import { isActionPlaying, playAction } from '../utils/playActions.js';

const QUICK_LAUNCH_LIMIT = 12;
const FADE_MS = 500;

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The steps to a first show, each done or not, so a new person always knows what is next. */
export function setupSteps(project, output) {
  const isRealOutput = Boolean(output?.connected) && output.driver !== 'mock';
  return [
    {
      id: 'lights',
      view: 'patch',
      title: 'Add your lights',
      hint: 'Tell the app which lights you have and their DMX addresses.',
      isDone: project.fixtures.length > 0,
    },
    {
      id: 'output',
      view: 'monitor',
      title: 'Connect the output',
      hint:
        output?.driver === 'mock'
          ? 'You are using the simulator. Connect a cable or network node to light real lights.'
          : 'Choose how the signal leaves this computer.',
      isDone: isRealOutput,
    },
    {
      id: 'look',
      view: 'control',
      title: 'Save a look',
      hint: 'Set the lights how you like them, then save it on the Looks screen.',
      isDone: project.scenes.length > 0,
    },
    {
      id: 'sequence',
      view: 'chases',
      title: 'Build a sequence',
      hint: 'Chain your looks together with timed fades.',
      isDone: project.chases.length > 0,
    },
  ];
}

export function HomeView({ project, patch, live, flush, navigate }) {
  const { engine, output } = live;
  const items = buildPerformItems(project, patch).slice(0, QUICK_LAUNCH_LIMIT);
  const steps = setupSteps(project, output);
  const doneCount = steps.filter((step) => step.isDone).length;
  const nextStep = steps.find((step) => !step.isDone);
  // With most of the setup done, the pads matter more than the checklist, so they come first.
  const isNearlyDone = doneCount >= steps.length - 1;
  const isOutputReady = live.connected && Boolean(output?.connected);
  const outputName = output?.driver ? (DRIVER_LABELS[output.driver] ?? output.driver) : 'No output';

  const isPlaying = (item) => isActionPlaying(item.action, engine);
  const handlePlay = (item) => playAction({ action: item.action, engine, send: live.send, flush, fadeMs: FADE_MS });

  const checklist = nextStep ? (
    <section className="card card-pad checklist" aria-label="Getting started">
      <div className="section-bar">
        <h2 className="section-title">Getting started</h2>
        <span className="pill">
          {doneCount} of {steps.length} done
        </span>
      </div>
      <ol className="checklist-steps">
        {steps.map((step) => (
          <li key={step.id} className="checklist-step" data-done={step.isDone}>
            <span className="checklist-mark" aria-hidden="true">
              {step.isDone ? <Icon name="check" size={14} /> : null}
            </span>
            <span className="checklist-text">
              <strong>{step.title}</strong>
              <span>{step.isDone ? 'Done' : step.hint}</span>
            </span>
            {step.isDone ? null : (
              <button type="button" className="btn" onClick={() => navigate(step.view)}>
                {step.title}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  ) : null;

  return (
    <section className="view" aria-labelledby="home-title">
      <div className="view-header">
        <div>
          <p className="eyebrow">Welcome back</p>
          <h1 className="view-title" id="home-title">
            {project.name}
          </h1>
          <p className="view-sub">
            {nextStep
              ? `Next: ${nextStep.title.toLowerCase()}. ${nextStep.hint}`
              : 'Everything is set up. Launch a look or a sequence below, or open Perform to run the show.'}
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => navigate('perform')}>
          <Icon name="bolt" size={16} />
          Open Perform
        </button>
      </div>

      <div className="stat-row">
        <button type="button" className="card stat-card" onClick={() => navigate('monitor')}>
          <span className="eyebrow">Output</span>
          <strong className="stat-value">{outputName}</strong>
          <span className="stat-note">
            <span className={`dot ${isOutputReady ? 'dot-ok' : 'dot-bad'}`} aria-hidden="true" />
            {isOutputReady ? 'Connected' : 'Not connected. Open Output to fix it.'}
          </span>
        </button>
        <button type="button" className="card stat-card" onClick={() => navigate('patch')}>
          <span className="eyebrow">Rig</span>
          <strong className="stat-value">{plural(project.fixtures.length, 'light')}</strong>
          <span className="stat-note">
            {plural(project.scenes.length, 'look')} · {plural(project.chases.length, 'sequence')}
          </span>
        </button>
        <button type="button" className="card stat-card" onClick={() => navigate('perform')}>
          <span className="eyebrow">Tempo</span>
          <strong className="stat-value">
            {Math.round(engine.bpm * 10) / 10} <small>BPM</small>
          </strong>
          <span className="stat-note">Effects and beat-timed sequences follow it</span>
        </button>
      </div>

      {isNearlyDone ? (
        <>
          <section className="pad-section" aria-labelledby="quick-launch">
            <div className="pad-section-head">
              <h2 className="section-title" id="quick-launch">
                Quick launch
              </h2>
              <button type="button" className="btn btn-ghost" onClick={() => navigate('perform')}>
                See all on Perform
              </button>
            </div>
            {items.length === 0 ? (
              <div className="empty">
                <strong>Nothing to launch yet</strong>
                <p>Save a look and it shows up here as a pad.</p>
              </div>
            ) : (
              <div className="perform-grid perform-grid-compact">
                {items.map((item) => (
                  <PerformTile
                    key={`${item.action.type}-${item.action.id}`}
                    name={item.name}
                    kind={item.kind}
                    detail={item.detail}
                    gradient={item.gradient}
                    steps={item.steps}
                    playingStep={item.kind === 'Sequence' && isPlaying(item) ? engine.chaseStep : null}
                    keyLabel={null}
                    midiLabel={null}
                    isPlaying={isPlaying(item)}
                    isArmed={false}
                    onPress={() => handlePlay(item)}
                  />
                ))}
              </div>
            )}
          </section>
          {checklist}
        </>
      ) : (
        <>
          {checklist}
          <section className="pad-section" aria-labelledby="quick-launch">
            <div className="pad-section-head">
              <h2 className="section-title" id="quick-launch">
                Quick launch
              </h2>
              <button type="button" className="btn btn-ghost" onClick={() => navigate('perform')}>
                See all on Perform
              </button>
            </div>
            {items.length === 0 ? (
              <div className="empty">
                <strong>Nothing to launch yet</strong>
                <p>Save a look and it shows up here as a pad.</p>
              </div>
            ) : (
              <div className="perform-grid perform-grid-compact">
                {items.map((item) => (
                  <PerformTile
                    key={`${item.action.type}-${item.action.id}`}
                    name={item.name}
                    kind={item.kind}
                    detail={item.detail}
                    gradient={item.gradient}
                    steps={item.steps}
                    playingStep={item.kind === 'Sequence' && isPlaying(item) ? engine.chaseStep : null}
                    keyLabel={null}
                    midiLabel={null}
                    isPlaying={isPlaying(item)}
                    isArmed={false}
                    onPress={() => handlePlay(item)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
