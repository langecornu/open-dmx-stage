# Open DMX Stage

**Light your show from the browser.** Colour your fixtures, save looks, and chain them into sequences with smooth
fades. Works with USB-DMX cables, the ENTTEC DMX USB Pro, Art-Net and sACN, or a built-in simulator when you have no hardware.

![Open DMX Stage, Home screen](docs/images/16-home-dark.jpg)

## Features

- **Home and search:** a start screen with a setup checklist and quick launch pads, a command palette on **Ctrl/⌘ K**
  to jump anywhere or run anything, and a **?** shortcut list.
- **Always know what is on stage:** a bar on every screen says what is playing and gives the one button that stops it,
  with a live view of every light in the colour it is really sending.
- **Colour studio:** quick colours, a custom colour picker and brightness, applied to all or selected fixtures.
- **Looks:** save what is on stage and recall it with a configurable fade.
- **Sequences:** chain looks with fade and hold times, loop them, and watch a visual timeline.
- **Setup:** auto-addressing, conflict warnings, and fixture import from QLC+ (`.qxf`) and Open Fixture Library
  (`.json`) files.
- **Output monitor:** a live view of all 512 DMX channels.
- **Master and blackout** that affect brightness only, never pan or tilt.
- **Light and dark themes**, a first-run welcome, and a responsive layout for phones and tablets.
- **Many outputs:** passive FTDI USB-DMX cables (such as the DSD TECH SH-RS09B), ENTTEC DMX USB Pro and DMXKing,
  Art-Net and sACN, chosen from the app with no configuration files.
- **Perform screen:** every look and sequence as a big button with keyboard shortcuts, and MIDI controller mapping
  (pads to looks, a knob to the master) in Chrome and Edge.
- **Fixtures screen:** search the Open Fixture Library for your light and copy its channels, or describe it by hand
  (manufacturer, model, description and channel layout). Built-in fixtures from maker manuals are included.
- **Follow the music:** the tempo can follow the beat of music from the microphone or a browser tab.
- **Mute and solo:** keep one light dark, or light only the ones you choose, live during a show.
- **Tempo, effects and groups:** tap a tempo, run pulse, sweep and rainbow effects on all lights or a group, and time
  sequences in beats.
- **Connection helpers:** detect whether a USB adapter is a passive cable or an adapter with its own processor, and a
  one-button test that cycles your lights through red, green, blue and white.
- **Simulator mode:** try everything without lights or a dongle.

## Quick start

```bash
git clone https://github.com/langecornu/open-dmx-stage.git
cd open-dmx-stage
npm install
npm run dev
```

Open http://localhost:5173. Requires Node.js 24.15 or newer (24 LTS; `nvm install && nvm use` reads `.nvmrc`). The tests need it; the app itself also starts on older versions.

- **[Install guide](docs/INSTALL.md):** dependencies, connecting a DMX interface, configuration, troubleshooting.
- **[Usage guide](docs/USAGE.md):** a tour of every screen, with screenshots.
- **[Connecting your lights](docs/CONNECTION.md):** a beginner-friendly guide to adapters, wiring and setup. It is also
  built into the app (Output screen, **How to connect**).

## Real lights

Open the **Output** screen, choose your interface (USB-DMX cable, ENTTEC Pro, Art-Net or sACN), pick the port or enter
an address, and press **Connect**. Supported interfaces, platform notes and troubleshooting are in the
[install guide](docs/INSTALL.md#4-connect-real-dmx-lights) and the
full [connection guide](docs/CONNECTION.md). USB output with a passive cable has been verified once: a DSD TECH SH-RS09B passive cable on a Mac (macOS 26, Apple silicon) driving two LED par lights, with steady colours and no flicker. Other adapters
(ENTTEC Pro and compatibles) and network output have not yet been tried on real lights.

## Scripts

| Command                          | What it does                                                  |
| -------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                    | API on :4000 and web app on :5173 with live reload            |
| `npm run build` then `npm start` | Production build, served from one port (:4000)                |
| `npm run check`                  | Lint, type check, tests and build (run before a pull request) |
| `npm test`                       | Server tests (`node:test`) and browser tests (Vitest)         |
| `npm run test:coverage`          | Tests with coverage thresholds                                |
| `npm run typecheck`              | Type check the JavaScript through JSDoc                       |
| `npm run lint`                   | ESLint                                                        |
| `npm run format`                 | Prettier                                                      |

## How it works

- `server/services/dmxEngine.js` layers a running look or sequence under live manual changes, applies master and
  blackout to brightness channels only, and sends one 512-slot frame per tick (default 30 Hz).
- Drivers live in `server/clients/` (`mock`, `open-dmx`, `enttec-pro`, `artnet`, `sacn`). Add another by implementing
  `open`, `send`, `close` and `getStatus`, then register it in `server/services/outputManager.js`.
- The browser sends fader moves over a WebSocket (`/live`) and receives the live frame and engine state. The HTTP API
  is versioned under `/api/v1`; `/healthz` and `/readyz` report the server's state.
- Your show is one JSON document (`server/data/project.json`) with a schema version and migrations, validated with zod,
  saved atomically with a rolling backup, and exportable from the Setup screen.
- `shared/patch.js` resolves fixtures to absolute DMX channels for both the server and the browser.

## Project layout

| Folder     | What is in it                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `server/`  | Express API, WebSocket, DMX engine and output drivers (`clients/`), show storage (`data/`)                          |
| `shared/`  | Code used by both sides, such as the patch resolver                                                                 |
| `src/`     | The React app: `components/`, `hooks/`, `utils/` (pure helpers), `styles/` (`tokens.css`, `app.css`, `console.css`) |
| `tests/`   | `server/` (`node:test`) and `web/` (Vitest and Testing Library, with axe accessibility checks)                      |
| `docs/`    | Install, usage and connection guides, coding standards, decisions (`adr/`) and the screenshots                      |
| `scripts/` | Hardware ramp test, demo show, bundle size and licence checks                                                       |

## Working on another computer

Copying the whole folder works, but some things do not travel with the code, so check these:

1. **Reinstall dependencies, do not copy them.** Delete `node_modules` and `dist`, install Node 24 (`nvm install`),
   then run `npm ci`. The USB driver (`serialport`) is built per operating system and chip.
2. **Your show is not in git.** It lives in `server/data/project.json` (with `project.json.bak`), and the chosen output
   in `server/data/output.json`. They are in the copied folder. Export the show from **Setup** as a backup as well.
3. **The serial port name is different on every computer** (for example `/dev/tty.usbserial-XXXX` on macOS, `COM3` on
   Windows). Open **Output**, pick the port again and press **Connect**.
4. **Your `.env`** (if you made one) is git-ignored and is copied with the folder. Start from `.env.example` otherwise.
5. **Browser settings stay in the old browser:** theme, the Perform MIDI mapping and the welcome screen are saved in the
   browser's local storage, not in the folder.
6. **GitHub:** sign in again on the new computer (`gh auth login`). The `.git` folder carries the remote and the commit
   identity set for this repository. Check with `git remote -v`, `git config user.email` and `gh api user --jq .login`.
7. Run `npm run check` once to confirm the new machine is healthy, then `npm run dev`.

Day to day: branch from `main`, keep pull requests small, run `npm run check`, update `CHANGELOG.md` and the docs for
anything users can see. [CONTRIBUTING.md](CONTRIBUTING.md) has the rules.

## Project status

Version 0.1 (see [CHANGELOG.md](CHANGELOG.md) for what is coming in the next release). One universe. Planned: more DMX interfaces, a beat-synced timeline, and export to other lighting systems. Issues and pull requests are welcome.

## Contributing

See [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md) for the code style, testing and review rules.
Run `npm run check` before opening a pull request. See also [CONTRIBUTING.md](CONTRIBUTING.md) and
[SECURITY.md](SECURITY.md).

## Security

The server has no authentication, so it listens only on this computer by default (set `HOST` to change that, on a
network you trust). It restricts browser origins, validates all input and rate limits the API, but do not expose it to
the internet. To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Credits

Built on open source software; see [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for the full list and format credits. This
project is independent and is not affiliated with ENTTEC, inMusic (SoundSwitch, Engine DJ, Denon DJ), QLC+ or the
Open Fixture Library.

## License

MIT. See [LICENSE](LICENSE).
