# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Tempo and tap tempo:** a shared tempo (30 to 300 beats per minute) set by typing, tapping (button or the `.` key)
  or halving and doubling it.
- **Effects:** pulse, sweep and rainbow, locked to the tempo, over all lights or one group. Live only; not saved.
- **Fixture groups** in Setup, used to aim effects at part of the rig.
- **Sequences in beats:** a sequence can time its steps in beats and follow the tempo.
- **Fixtures screen:** write your own fixture definitions by hand: manufacturer, model, description, and the channels of
  each mode (name, what it does, resting value; add, reorder and remove). Built-in fixtures are read-only examples you
  can copy. Your fixtures are saved in the show file. Fixtures have a new `description` field (optional in older shows).
- **U`King 40W RGBW Moving Head Light** built-in fixture (13 channel mode, from the maker's manual) and the worked
  example for the Fixtures screen. Not yet tried on the real light.

- **Perform screen:** big buttons for every look and sequence, keyboard shortcuts (Space blackout, Escape stop, [ and ]
  master), and MIDI controller mapping with learn mode (pads to looks and sequences, a knob to the master). MIDI
  links are saved in the browser.
- **Detect adapter:** asks a USB adapter to identify itself (the ENTTEC Pro query) and selects the matching interface;
  a passive cable stays silent. Not yet tried on real hardware.
- **Test lights:** cycles every patched fixture through red, green, blue and white from the Connection card.

### Changed

- The show file is now `schemaVersion` 3 (adds `groups`, and `timing` plus beat fields on sequences). Older shows are
  upgraded automatically; a show saved by this version cannot be opened by an older app.

## [0.1.0] - 2026-11-09

First release. USB output (passive USB-DMX cables and the ENTTEC Pro driver) follows the published formats but has not
been verified on real hardware; the simulator and Art-Net output have been checked.

### Added

- Lights, Looks, Sequences, Setup and Output screens: colour studio, saved looks with fades, sequences with a timeline,
  fixture patching with automatic addressing, and a live view of all 512 channels.
- Outputs: simulator, passive USB-DMX cables (Open DMX style), ENTTEC DMX USB Pro and DMXKing, Art-Net and sACN, chosen
  from the app.
- In-app connection guide and `docs/CONNECTION.md`, including how to tell passive and active adapters apart.
- Fixture import from QLC+ (`.qxf`) and Open Fixture Library (`.json`) files.
- Light and dark themes, a first-run welcome, and a layout for phones and tablets.
- `npm run dmx:ramp` hardware check script.
- Continuous integration, Dependabot, type checking (JSDoc with `tsc`), component and accessibility tests, coverage
  thresholds, a bundle size budget and a licence check.
- Show file `schemaVersion` with migrations, a rolling backup, and Export and Import of a show.
- Request ids, a structured logger and `/healthz` and `/readyz` endpoints.
- Contributor docs: coding standards, contributing guide, security policy, issue and pull request templates, and
  architecture decision records.

### Changed

- The HTTP API is versioned under `/api/v1`.
- The server listens on the loopback address by default; set `HOST` to allow other devices.
- Network output destinations must be local-network IPv4 addresses.
- Chase steps have stable ids.

### Fixed

- Switching adapter type on the same serial port, output status when network sends fail, blank frame on output switch.
- Shows larger than 1 MB (up to the schema's 2.4 MB) can be saved, exported and imported again.
- A show saved by a newer version of the app is left untouched and is never overwritten by an older one.
- The welcome screen is a real modal: keyboard focus stays inside it and Escape skips it.
- The connection guide's comparison table has an accessible header.

### Not verified

- USB output has not been tested on real hardware yet.

[Unreleased]: https://github.com/langecornu2027/open-dmx-stage/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/langecornu2027/open-dmx-stage/releases/tag/v0.1.0
