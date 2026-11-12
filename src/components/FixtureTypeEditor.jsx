// Edits one fixture definition: manufacturer, model, description, and the channels of each mode. A built-in example is
// shown read-only with a button to copy it, so the original stays as a reference.
import { DMX_CHANNELS } from '../../shared/patch.js';
import {
  canAddChannel,
  MAX_DESCRIPTION_LENGTH,
  MAX_MODES,
  MAX_NAME_LENGTH,
  newChannel,
} from '../utils/fixtureTypes.js';
import { guessCategory } from '../../shared/categories.js';
import { CategorySelect } from './CategorySelect.jsx';
import { ChannelRow } from './ChannelRow.jsx';
import { Icon } from './Icon.jsx';

export function FixtureTypeEditor({ type, isBuiltIn, usedBy, onChange, onDuplicate, onDelete }) {
  const patchMode = (modeIndex, changes) =>
    onChange({ modes: type.modes.map((mode, index) => (index === modeIndex ? { ...mode, ...changes } : mode)) });
  const patchChannels = (modeIndex, channels) => patchMode(modeIndex, { channels });

  const handleChannel = (modeIndex, channelIndex, changes) =>
    patchChannels(
      modeIndex,
      type.modes[modeIndex].channels.map((channel, index) =>
        index === channelIndex ? { ...channel, ...changes } : channel,
      ),
    );
  const handleMove = (modeIndex, channelIndex, direction) => {
    const channels = [...type.modes[modeIndex].channels];
    [channels[channelIndex], channels[channelIndex + direction]] = [
      channels[channelIndex + direction],
      channels[channelIndex],
    ];
    patchChannels(modeIndex, channels);
  };

  return (
    <div className="card card-pad fixture-editor">
      {isBuiltIn ? (
        <p className="view-sub" role="status">
          This is a built-in example, so it cannot be changed. Make a copy to edit it as your own.
        </p>
      ) : null}
      <div className="toolbar">
        <button type="button" className="btn" onClick={onDuplicate}>
          <Icon name="plus" size={16} />
          Make a copy
        </button>
        {isBuiltIn ? null : (
          <button type="button" className="btn btn-danger" disabled={usedBy > 0} onClick={onDelete}>
            <Icon name="trash" size={16} />
            Delete this fixture
          </button>
        )}
        {usedBy > 0 ? (
          <span className="fixture-meta">
            Used by {usedBy} {usedBy === 1 ? 'light' : 'lights'} in your rig, so it cannot be deleted or have modes
            removed.
          </span>
        ) : null}
      </div>

      <fieldset className="fixture-fields" disabled={isBuiltIn}>
        <legend className="sr-only">Fixture details</legend>
        <label className="field">
          Manufacturer
          <input
            className="input"
            value={type.manufacturer}
            maxLength={MAX_NAME_LENGTH}
            onChange={(event) => onChange({ manufacturer: event.target.value })}
          />
        </label>
        <label className="field">
          Model
          <input
            className="input"
            value={type.name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(event) => onChange({ name: event.target.value || type.name })}
          />
        </label>
        <div className="field">
          <span aria-hidden="true">Device type</span>
          <CategorySelect
            label="Device type"
            value={type.category ?? ''}
            inherited={guessCategory(type)}
            inheritedFrom="best guess"
            onChange={(value) => onChange({ category: value || undefined })}
          />
        </div>
        <label className="field fixture-description">
          Description
          <textarea
            className="input"
            rows={2}
            value={type.description}
            maxLength={MAX_DESCRIPTION_LENGTH}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </label>

        {type.modes.map((mode, modeIndex) => (
          // Modes and channels have no ids in the show file, and every field here is controlled (no state kept in a
          // row), so the position is a safe key.
          <section key={modeIndex} className="fixture-mode" aria-label={`Mode ${modeIndex + 1}`}>
            <div className="toolbar">
              <label className="field">
                Mode name
                <input
                  className="input"
                  value={mode.name}
                  maxLength={MAX_NAME_LENGTH}
                  onChange={(event) => patchMode(modeIndex, { name: event.target.value || mode.name })}
                />
              </label>
              <span className="pill">{mode.channels.length} ch</span>
              <button
                type="button"
                className="btn btn-danger"
                disabled={type.modes.length === 1 || usedBy > 0}
                aria-label={`Remove mode ${modeIndex + 1}`}
                onClick={() => onChange({ modes: type.modes.filter((_, index) => index !== modeIndex) })}
              >
                <Icon name="trash" size={16} />
                Remove mode
              </button>
            </div>
            <div className="channel-row channel-head" aria-hidden="true">
              <span />
              <span>Name</span>
              <span>What it does</span>
              <span>Rests at</span>
              <span />
            </div>
            {mode.channels.map((channel, channelIndex) => (
              <ChannelRow
                key={channelIndex}
                channel={channel}
                index={channelIndex}
                count={mode.channels.length}
                onChange={(index, changes) => handleChannel(modeIndex, index, changes)}
                onMove={(index, direction) => handleMove(modeIndex, index, direction)}
                onRemove={(index) =>
                  patchChannels(
                    modeIndex,
                    mode.channels.filter((_, at) => at !== index),
                  )
                }
              />
            ))}
            <div>
              <button
                type="button"
                className="btn"
                disabled={!canAddChannel(mode.channels.length)}
                onClick={() => patchChannels(modeIndex, [...mode.channels, newChannel()])}
              >
                <Icon name="plus" size={16} />
                Add channel
              </button>
              {canAddChannel(mode.channels.length) ? null : (
                <span className="fixture-meta"> A universe has {DMX_CHANNELS} channels.</span>
              )}
            </div>
          </section>
        ))}

        <div>
          <button
            type="button"
            className="btn"
            disabled={type.modes.length >= MAX_MODES}
            onClick={() =>
              onChange({ modes: [...type.modes, { name: `Mode ${type.modes.length + 1}`, channels: [newChannel()] }] })
            }
          >
            <Icon name="plus" size={16} />
            Add mode
          </button>
        </div>
      </fieldset>
    </div>
  );
}
