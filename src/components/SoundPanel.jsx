// "Follow the music": listen to the microphone or a browser tab's sound, find the beat, and set the tempo from it, so
// the effects and the sequences timed in beats keep time with the music.
import { useState } from 'react';

import { SOURCES, useBeatFollower } from '../hooks/useBeatFollower.js';

export function SoundPanel({ send }) {
  const follower = useBeatFollower({ send });
  const [source, setSource] = useState(SOURCES.MICROPHONE);
  const [deviceId, setDeviceId] = useState('');
  const isOn = follower.status !== 'off';

  const handleToggle = () => {
    if (isOn) {
      follower.stop();
    } else {
      follower.start({ source, deviceId: source === SOURCES.MICROPHONE && deviceId !== '' ? deviceId : undefined });
    }
  };

  let statusText = 'Not listening.';
  if (follower.status === 'asking') {
    statusText = 'Waiting for the browser to allow the sound…';
  } else if (follower.status === 'listening') {
    statusText = follower.isLocked
      ? `Following the beat: ${follower.bpm} beats per minute.`
      : 'Listening… waiting for a steady beat.';
  }

  return (
    <section className="card card-pad sound-panel" aria-label="Follow the music">
      <div className="section-bar">
        <h2 className="section-title">Follow the music</h2>
        {follower.isLocked ? <span className="pill">{follower.bpm} bpm</span> : null}
      </div>
      <p className="view-sub">
        Listens to the sound, finds the beat, and sets the tempo, so the effects and the sequences timed in beats keep
        time with the music. The sound is analysed in this page and is never recorded or sent anywhere.
      </p>
      <div className="toolbar">
        <label className="field">
          Listen to
          <select className="select" value={source} disabled={isOn} onChange={(event) => setSource(event.target.value)}>
            <option value={SOURCES.MICROPHONE}>The microphone (music playing in the room)</option>
            <option value={SOURCES.TAB}>A browser tab&apos;s sound (best for music in Chrome)</option>
          </select>
        </label>
        {source === SOURCES.MICROPHONE && follower.inputs.length > 1 ? (
          <label className="field">
            Microphone
            <select
              className="select"
              value={deviceId}
              disabled={isOn}
              onChange={(event) => setDeviceId(event.target.value)}
            >
              <option value="">Default</option>
              {follower.inputs.map((input) => (
                <option key={input.id} value={input.id}>
                  {input.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" className="btn btn-primary" aria-pressed={isOn} onClick={handleToggle}>
          {isOn ? 'Stop listening' : 'Start listening'}
        </button>
      </div>
      {source === SOURCES.TAB && !isOn ? (
        <p className="view-sub">
          Chrome will ask what to share. Choose the tab with your music and tick <strong>Also share tab audio</strong>.
          For music in another app, pick a loopback input such as BlackHole as the microphone.
        </p>
      ) : null}
      {follower.error ? (
        <p className="error-banner" role="alert">
          {follower.error}
        </p>
      ) : null}
      <p className="view-sub" role="status">
        {statusText}
      </p>
      {follower.status === 'listening' ? (
        <p className="view-sub sound-detail">
          Heard {follower.beatsHeard} beats. Strongest rhythm: {follower.candidateBpm ?? 'none yet'}
          {follower.candidateBpm ? ` bpm, ${Math.round(follower.confidence * 100)}% steady` : ''}.
        </p>
      ) : null}
      {follower.status === 'listening' ? (
        <div
          className="sound-meter"
          role="meter"
          aria-label="Sound level"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(follower.level * 100)}
        >
          <div className="sound-meter-fill" style={{ width: `${Math.round(follower.level * 100)}%` }} />
        </div>
      ) : null}
    </section>
  );
}
