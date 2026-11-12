// One fixture: a glowing orb showing what it is emitting, tap to select, expandable raw channel faders.
import { useState } from 'react';

import { DMX_CHANNELS } from '../../shared/patch.js';
import { fixtureColor } from '../utils/sceneColors.js';
import { Fader } from './Fader.jsx';
import { Icon } from './Icon.jsx';
import { DeviceIcon } from './DeviceIcon.jsx';

export function FixtureTile({
  fixture,
  category = 'other',
  range,
  patch,
  valueOf,
  overridden,
  isSelected,
  onToggleSelect,
  onSet,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const color = fixtureColor(range, patch, valueOf);
  const glow = color.level;

  const channels = [];
  for (let channel = range.start; channel <= Math.min(range.end, DMX_CHANNELS); channel += 1) {
    channels.push({ channel, info: patch.channels.get(channel) });
  }

  const orbStyle =
    glow > 0.02
      ? {
          backgroundColor: color.css,
          backgroundImage: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), transparent 45%)',
          boxShadow: `0 0 ${10 + glow * 26}px ${glow * 6}px ${color.css}`,
        }
      : undefined;

  return (
    <article className="card tile" data-selected={isSelected}>
      <button type="button" className="tile-main" aria-pressed={isSelected} onClick={() => onToggleSelect(fixture.id)}>
        <span className="orb" style={orbStyle} aria-hidden="true" />
        <span>
          <span className="tile-name">
            <DeviceIcon category={category} size={22} glow={glow > 0.02 ? color.css : undefined} />
            {fixture.name}
          </span>
          <br />
          <span className="tile-meta">
            DMX {range.start}–{range.end}
          </span>
        </span>
        <span className="tile-check" aria-hidden="true">
          <Icon name="check" size={14} />
        </span>
      </button>
      <button type="button" className="tile-toggle" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        <Icon name="sliders" size={15} />
        {isOpen ? 'Hide channels' : 'Channels'}
      </button>
      {isOpen ? (
        <div className="faders">
          {channels.map(({ channel, info }) => (
            <Fader
              key={channel}
              label={info.channelName}
              type={info.type}
              value={valueOf(channel)}
              isOverridden={overridden.has(channel)}
              onChange={(value) => onSet({ [channel]: value })}
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}
