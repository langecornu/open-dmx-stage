# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project follows [Semantic Versioning](https://semver.org/). Nothing has been released yet.

## [Unreleased]

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

### Not verified

- USB output has not been tested on real hardware yet.
