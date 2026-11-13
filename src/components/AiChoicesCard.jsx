// The choices card of AI shows: leave everything to the AI, or steer it with a mood, the energy, colours to use more,
// less or never, how much of each thing this venue's lights can do, and how many looks and sequences to make.
import { plural } from '../utils/format.js';
import { Icon } from './Icon.jsx';

const ENERGIES = [
  { value: '', label: 'Let the AI choose' },
  { value: '15', label: 'Calm' },
  { value: '40', label: 'Relaxed' },
  { value: '65', label: 'Lively' },
  { value: '90', label: 'Intense' },
];
const AMOUNT_LABELS = { auto: 'Auto', more: 'More', less: 'Less', off: 'Off' };
const COLOUR_LABELS = { more: 'Use more', less: 'Use less', avoid: 'Avoid' };
const BAR_CHOICES = [4, 8, 16, 32, 64];
// Each added colour starts as a different one, to change from there.
const STARTING_COLOURS = ['#ff0040', '#00c8ff', '#ffb000', '#8b5cf6', '#22c55e', '#ff6a00'];

export function AiChoicesCard({ choices, setChoices, features, hasSong }) {
  const set = (changes) => setChoices({ ...choices, ...changes });
  return (
    <section className="card card-pad ai-card" aria-labelledby="ai-choices-title">
      <h2 className="section-title" id="ai-choices-title">
        Your choices
      </h2>
      <label className="pill ai-auto">
        <input type="checkbox" checked={choices.auto} onChange={(event) => set({ auto: event.target.checked })} />
        Let the AI decide everything
      </label>
      {choices.auto ? (
        <p className="view-sub">
          The AI picks the colours, the energy and how much of everything the lights can do. Untick to steer it.
        </p>
      ) : (
        <div className="ai-choices">
          <label className="field">
            Mood or style
            <textarea
              className="input"
              rows={2}
              maxLength={500}
              placeholder="Warm and elegant for a wedding dinner, then a party after 10 pm…"
              value={choices.mood}
              onChange={(event) => set({ mood: event.target.value })}
            />
          </label>
          <label className="field">
            Energy
            <select
              className="select"
              value={choices.energy === null ? '' : String(choices.energy)}
              onChange={(event) => set({ energy: event.target.value === '' ? null : Number(event.target.value) })}
            >
              {ENERGIES.map((energy) => (
                <option key={energy.value} value={energy.value}>
                  {energy.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="ai-fieldset">
            <legend>Colours</legend>
            {choices.colours.length === 0 ? (
              <p className="fixture-meta">No colour preferences: the AI chooses.</p>
            ) : null}
            {choices.colours.map((colour, index) => (
              // Colours have no ids and every field is controlled, so the position is a safe key.
              <div key={index} className="ai-colour">
                <input
                  type="color"
                  aria-label={`Colour ${index + 1}`}
                  value={colour.hex}
                  onChange={(event) =>
                    set({
                      colours: choices.colours.map((entry, at) =>
                        at === index ? { ...entry, hex: event.target.value } : entry,
                      ),
                    })
                  }
                />
                <select
                  className="select select-compact"
                  aria-label={`How to use colour ${index + 1}`}
                  value={colour.amount}
                  onChange={(event) =>
                    set({
                      colours: choices.colours.map((entry, at) =>
                        at === index ? { ...entry, amount: event.target.value } : entry,
                      ),
                    })
                  }
                >
                  {Object.entries(COLOUR_LABELS).map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-compact"
                  aria-label={`Remove colour ${index + 1}`}
                  onClick={() => set({ colours: choices.colours.filter((_, at) => at !== index) })}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
            {choices.colours.length < 12 ? (
              <button
                type="button"
                className="btn btn-compact"
                onClick={() =>
                  set({
                    colours: [
                      ...choices.colours,
                      { hex: STARTING_COLOURS[choices.colours.length % STARTING_COLOURS.length], amount: 'more' },
                    ],
                  })
                }
              >
                <Icon name="plus" size={16} />
                Add a colour
              </button>
            ) : null}
          </fieldset>

          <fieldset className="ai-fieldset">
            <legend>What the lights do</legend>
            {features.map((feature) => (
              <div key={feature.id} className="ai-feature">
                <span>
                  <span className="ai-feature-name">{feature.label}</span>
                  <span className="fixture-meta">
                    {feature.hint} · {feature.lights.join(', ')}
                  </span>
                </span>
                <div className="segmented" role="group" aria-label={feature.label}>
                  {Object.entries(AMOUNT_LABELS).map(([value, text]) => (
                    <button
                      key={value}
                      type="button"
                      className="segmented-option"
                      aria-pressed={(choices.features[feature.id] ?? 'auto') === value}
                      onClick={() => set({ features: { ...choices.features, [feature.id]: value } })}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
        </div>
      )}
      <div className="toolbar">
        <label className="field">
          Looks
          <input
            className="input input-narrow"
            type="number"
            min="2"
            max="16"
            value={choices.looks}
            onChange={(event) => set({ looks: Math.max(2, Math.min(16, Number(event.target.value) || 2)) })}
          />
        </label>
        <label className="field">
          Sequences
          <input
            className="input input-narrow"
            type="number"
            min="1"
            max="4"
            value={choices.sequences}
            onChange={(event) => set({ sequences: Math.max(1, Math.min(4, Number(event.target.value) || 1)) })}
          />
        </label>
        {hasSong ? null : (
          <label className="field">
            Sequence length
            <select
              className="select"
              value={choices.bars}
              onChange={(event) => set({ bars: Number(event.target.value) })}
            >
              {BAR_CHOICES.map((bars) => (
                <option key={bars} value={bars}>
                  {plural(bars, 'bar')}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}
