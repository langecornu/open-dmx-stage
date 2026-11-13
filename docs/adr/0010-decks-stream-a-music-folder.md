# 10. The decks play a music folder on the server, in the browser showing them

Status: accepted

## Context

Perform gets two DJ decks so a show can run from the music the lights are made for, without a separate DJ setup or a
microphone. The music lives on the computer running the app (a Mac, or a Raspberry Pi with a USB stick); the person
plays from a laptop, phone or tablet whose speakers or headphone output feed the room. The lights must follow the beat
of what is heard, to the bar.

## Decision

- The library is one folder on the server (`~/Music` until changed in the decks), scanned for audio files (MP3, AAC,
  M4A, WAV, FLAC, OGG, Opus, AIFF), at most 6 folders deep and 5000 tracks, skipping hidden files and symbolic links.
  Tags (title, artist, album, length, BPM) are read with `music-metadata` (MIT). The list is kept until a rescan.
- A track is asked for by an id from that list, never by a path: the server streams only files it listed, from inside
  the folder, with range requests so a device can seek.
- The audio plays in the browser showing the decks, through Web Audio: each deck's volume, then a constant-power
  crossfader. Tempo faders change the speed and the pitch together, as on a turntable.
- Each track is analysed once, in the browser that first loads it (the same tempo and downbeat finder as the AI song
  analysis), and the result (tempo, first downbeat, waveform outline) is kept on the server, keyed by track and dropped
  when the file changes.
- The lights follow the deck being heard (playing, loudest through its volume and the crossfader): its tempo is sent as
  soon as it changes, and a tempo message marked as a beat is scheduled on every downbeat, so the engine's beat lines up
  with the bar.

## Consequences

Any device on the network can list the folder's audio files, play them and change the folder, like every other control
(ADR 0008: no login, a trusted network). Only audio files inside the chosen folder can ever be read. Playback depends on
the browser's codecs (FLAC and OGG do not play everywhere on Apple devices). Sound from a device and lights from the
server meet over the network, so the lock is as good as its latency, a few milliseconds on a home network. Only one
device should play the decks at a time; two devices play two independent pairs of decks.
