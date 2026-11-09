// A visual strip of a sequence: each look is a block sized by its fade + hold time, with the fade shown as a ramp.
import { fixtureColors, sceneGradient } from '../utils/sceneColors.js';

const formatSeconds = (ms) => `${Math.round(ms / 100) / 10}s`;

export function SequenceTimeline({ chase, project, patch, playingIndex }) {
  const durations = chase.steps.map((step) => Math.max(1, step.fadeMs + step.holdMs));
  const total = durations.reduce((sum, value) => sum + value, 0);

  return (
    <div className="timeline" role="img" aria-label={`Timeline of ${chase.name}, ${formatSeconds(total)} long`}>
      <div className="timeline-track">
        {chase.steps.map((step, index) => {
          const scene = project.scenes.find((candidate) => candidate.id === step.sceneId);
          const colors = fixtureColors(project, patch, scene?.values ?? {});
          const fadeShare = Math.min(100, (step.fadeMs / durations[index]) * 100);
          return (
            <div
              key={index}
              className="timeline-block"
              data-playing={playingIndex === index}
              style={{ flexGrow: durations[index], background: sceneGradient(colors) }}
            >
              <span className="timeline-fade" style={{ width: `${fadeShare}%` }} />
              <span className="timeline-label">
                <strong>{scene?.name ?? 'Missing look'}</strong>
                <small>
                  {formatSeconds(step.fadeMs)} fade · {formatSeconds(step.holdMs)} hold
                </small>
              </span>
            </div>
          );
        })}
      </div>
      <div className="timeline-foot">
        <span>0s</span>
        <span>
          {formatSeconds(total)} {chase.loop ? '· loops' : ''}
        </span>
      </div>
    </div>
  );
}
