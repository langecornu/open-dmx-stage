// Which Claude model designs the show, each with what it is good for and roughly what this generation would cost on
// it, worked out from the number of lights, looks and sequences and the song's length. A real radio group, so it works
// from the keyboard and with a screen reader.
import { AI_MODELS, estimateCost, formatPriceRange } from '../../shared/aiModels.js';

/**
 * @param {{
 *   value: string,
 *   onChange: (modelId: string) => void,
 *   request: Parameters<typeof estimateCost>[0],
 *   disabled?: boolean,
 * }} props
 */
export function AiModelPicker({ value, onChange, request, disabled = false }) {
  return (
    <fieldset className="ai-models" disabled={disabled}>
      <legend>Model</legend>
      {AI_MODELS.map((model) => {
        const estimate = formatPriceRange(estimateCost(request, model.id));
        return (
          <label key={model.id} className="ai-model" data-selected={value === model.id || undefined}>
            <input
              type="radio"
              name="ai-model"
              value={model.id}
              checked={value === model.id}
              onChange={() => onChange(model.id)}
            />
            <span className="ai-model-name">{model.name}</span>
            <span className="ai-model-summary">{model.summary}</span>
            <span className="ai-model-cost">{estimate}</span>
          </label>
        );
      })}
      <p className="fixture-meta ai-models-note">
        Rough estimates at Anthropic list prices, for {request.lights} lights, {request.looks} looks and{' '}
        {request.sequences} {request.sequences === 1 ? 'sequence' : 'sequences'}
        {request.song ? ' following the song' : ''}. Billed to your API key.
      </p>
    </fieldset>
  );
}
