# Install guide

Open DMX Stage is a Node.js server plus a React web app. It runs on macOS, Windows and Linux. You do not need any
lighting hardware to try it: without a DMX interface it runs in **simulator mode**.

## 1. Requirements

### Software

| Dependency                    | Version                                 | Notes                                                                                                                                                               |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org) | 24.15 or newer (24 LTS)                 | The project pins `>=24.15.0` in `package.json` (`.nvmrc` says 24). The tests need it; the app itself may still start on older versions, but they are not supported. |
| npm                           | 10 or newer                             | Installed with Node.js.                                                                                                                                             |
| A modern browser              | Current Chrome, Edge, Firefox or Safari | The app is a normal web page; nothing to install in the browser.                                                                                                    |
| Git                           | Any recent version                      | Only needed to clone the repository.                                                                                                                                |

Check what you have:

```bash
node --version   # v24.x.x recommended
npm --version
```

If you manage Node versions with [nvm](https://github.com/nvm-sh/nvm), run `nvm install && nvm use` in the project
folder and it picks up `.nvmrc`.

### Hardware (optional, for real lights)

You need a way to get DMX out of the computer. Pick **one** of these:

| Interface                                   | Examples                                                             | Status                                                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **USB-DMX cable (passive FTDI "Open DMX")** | DSD TECH SH-RS09B, ENTTEC Open DMX USB, most cheap USB-to-DMX cables | Supported. Verified once (DSD TECH SH-RS09B, a Mac, two LED pars, steady colours). The computer generates the DMX timing, so it needs a quiet, unloaded machine. |
| **ENTTEC DMX USB Pro and compatibles**      | ENTTEC DMX USB Pro, DMXKing ultraDMX Micro/Pro                       | Supported (these have a built-in processor, so timing is reliable). Not yet tried on real lights.                                                                |
| **Art-Net** (network)                       | Art-Net nodes and gateways, many lighting apps and visualizers       | Supported.                                                                                                                                                       |
| **sACN / E1.31** (network)                  | sACN nodes and gateways, many lighting apps and visualizers          | Supported.                                                                                                                                                       |
| **Simulator**                               | none                                                                 | Always available.                                                                                                                                                |

You will also need a DMX cable (3-pin or 5-pin XLR to match your fixtures) and at least one DMX fixture. Set the
fixture's DMX address and mode on the fixture itself so they match the **Setup** screen. A 120 Ω terminator on the last
fixture in the chain is good practice on long runs.

> SoundSwitch's own dongles (Micro DMX, Control One) use a proprietary protocol and are not supported.

### Native package

Serial access uses the [`serialport`](https://serialport.io) package. It is installed as an _optional_ dependency and
ships prebuilt binaries for common platforms, so a normal `npm install` needs no compiler. If it cannot be installed on
your machine, everything still works in simulator mode.

## 2. Get the code and install

```bash
git clone https://github.com/langecornu/open-dmx-stage.git
cd open-dmx-stage
npm install
```

(Use `npm ci` instead of `npm install` for an exact, reproducible install from the lockfile.)

## 3. Run it (simulator mode)

```bash
npm run dev
```

Then open **http://localhost:5173**.

- The API listens on port **4000**, the web app on **5173**. Both listen only on this computer (loopback) by default.
- The top bar shows **Simulator**, which means nothing is sent to real lights yet.
- On first run a short welcome screen helps you add your lights. See the [usage guide](USAGE.md).

### Control it from a phone or tablet

By default the server only accepts connections from the computer it runs on, because the control surface has no
login. To use another device on the **same trusted network**, build the app and tell the server to listen more widely
and which page address to trust (use your computer's own address):

```bash
npm run build
HOST=0.0.0.0 ALLOWED_ORIGINS=http://192.168.1.20:4000 npm start
```

Then open `http://192.168.1.20:4000` on the phone. Anyone on that network could do the same, so do not do this on
public Wi-Fi.

## 4. Connect real DMX lights

> Connecting lights for the first time? Follow the [first light checklist](FIRST_LIGHT.md): it takes you from cables to
> a working show, with a starter show to import and a list of what to try when something does not respond.

> New to DMX? The [connection guide](CONNECTION.md) explains adapters (including passive vs active), wiring and addresses
> from scratch, with diagrams. The same guide opens inside the app from **Output, How to connect**.

### In the app (recommended)

1. Plug in the interface and connect the DMX cable to your first fixture.
2. Open the **Output** screen and find the **Connection** card.
3. Choose your interface type:
   - **USB-DMX cable** for the DSD TECH SH-RS09B and other passive FTDI cables.
   - **ENTTEC DMX USB Pro** for ENTTEC Pro and DMXKing interfaces.
   - **Art-Net** or **sACN** for network interfaces (optionally enter the device's IP address and a universe).
4. For USB interfaces, pick the **Serial port** (FTDI cables are labelled) and press **Connect**. Press **Refresh** if the
   port is missing.
5. The top bar should show **DMX ready**. Move a colour in **Lights** and the fixture should react.

Your choice is remembered. If the saved cable is unplugged when the app starts, it falls back to the simulator and tells
you why.

If the port does not appear:

- **macOS:** the cable appears as `/dev/tty.usbserial-XXXX`. If not, check _System Settings, Privacy & Security_ for a
  blocked driver prompt, then unplug and re-plug.
- **Linux:** add yourself to the serial group once, then log out and in: `sudo usermod -aG dialout $USER`.
- **Windows:** check Device Manager, _Ports (COM & LPT)_, for a `COM` port, and install the FTDI driver if none shows up.
- Only one program can use the cable at a time, so close other lighting software first.

### With environment variables

You can also preselect the output at start-up (the in-app choice, once saved, takes precedence):

```bash
# USB-DMX cable (Open DMX style), macOS / Linux
DMX_DRIVER=open-dmx DMX_SERIAL_PATH=/dev/tty.usbserial-XXXX npm run dev

# ENTTEC DMX USB Pro
DMX_DRIVER=enttec-pro DMX_SERIAL_PATH=/dev/tty.usbserial-EN123456 npm run dev

# Art-Net to one node (omit DMX_NET_HOST to broadcast), universe 0
DMX_DRIVER=artnet DMX_NET_HOST=192.168.1.50 DMX_UNIVERSE=0 npm run dev
```

```powershell
# Windows PowerShell
$env:DMX_DRIVER = "open-dmx"; $env:DMX_SERIAL_PATH = "COM3"; npm run dev
```

### A note on cheap USB-DMX cables

Passive cables such as the SH-RS09B have no processor, so this app generates the DMX break and timing in software.
That is within the DMX specification (it uses a long break), but it makes the output more sensitive to a busy computer
than an ENTTEC Pro. If lights flicker or ignore the cable, close other programs, try a different USB port (avoid hubs),
or use an Art-Net/sACN node or an ENTTEC Pro or DMXKing interface instead. Reviews of these cables are mixed, so make
sure yours works in another program first.

## 5. Configuration

Settings are environment variables. Copy `.env.example` for reference; the app reads the real environment (export the
variables, or set them in your process manager). Nothing is required.

| Variable            | Default                     | Meaning                                                                                                                                                                                                       |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`              | `4000`                      | API and WebSocket port.                                                                                                                                                                                       |
| `HOST`              | `127.0.0.1`                 | Address to listen on. Use `0.0.0.0` only on a trusted network (see above).                                                                                                                                    |
| `ALLOWED_ORIGINS`   | `http://localhost:5173`     | Comma-separated browser origins allowed to talk to the API, besides this server's own address (`localhost`, `127.0.0.1` and `[::1]` on `PORT`), which is always allowed.                                      |
| `DMX_DRIVER`        | `mock`                      | `mock` (simulator), `open-dmx`, `enttec-pro`, `artnet` or `sacn`. You can also choose this in the app, on the Output screen.                                                                                  |
| `DMX_SERIAL_PATH`   | _(empty)_                   | Serial port for `open-dmx` and `enttec-pro`.                                                                                                                                                                  |
| `DMX_NET_HOST`      | _(empty)_                   | Art-Net or sACN destination IP on your own network (private, loopback, link-local, multicast or broadcast). Hostnames and public addresses are rejected. Empty means broadcast (Art-Net) or multicast (sACN). |
| `DMX_UNIVERSE`      | `0` Art-Net, `1` sACN       | Universe to send on: Art-Net 0 to 32767, sACN 1 to 63999.                                                                                                                                                     |
| `DMX_FRAME_RATE`    | `30`                        | DMX frames per second, 1 to 44.                                                                                                                                                                               |
| `DATA_DIR`          | `server/data`               | Where `project.json` (your show) is stored.                                                                                                                                                                   |
| `ANTHROPIC_API_KEY` | (none)                      | The Anthropic API key for AI shows. When set, it is used instead of a key saved on Settings, and Settings says so.                                                                                            |
| `OFL_ENABLED`       | `true`                      | `false` turns off the online fixture search on the Fixtures screen, so the app never contacts the internet.                                                                                                   |
| `NODE_ENV`          | `development`               | `production` switches log output to JSON.                                                                                                                                                                     |
| `LOG_LEVEL`         | `info`                      | `debug`, `info`, `warn`, `error` or `silent`.                                                                                                                                                                 |
| `LOG_FORMAT`        | text, or json in production | `text` or `json`.                                                                                                                                                                                             |

## 6. Production build (single port)

```bash
npm run build
npm start
```

Open **http://localhost:4000**. The server serves the built app and the API from the same port. For a venue laptop or a
Raspberry Pi this is the simplest way to run it.

## 7. Verify the install

```bash
npm run check   # lint, type check, tests and build
```

The server also answers `GET /healthz` (is it up) and `GET /readyz` (and which output it is using).

## 8. Troubleshooting

| Symptom                                             | Fix                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EBADENGINE` warning on `npm install`               | You are on Node older than 24.15. Install Node 24 (`nvm install 24`) to remove the warning; the tests need it.                                                      |
| Port 5173 is already in use                         | Run the web app on another port and allow it: `ALLOWED_ORIGINS=http://localhost:5180 npm run dev:api` in one terminal, `npm run dev:web -- --port 5180` in another. |
| Top bar says **Server offline**                     | The API is not running or the browser origin is not in `ALLOWED_ORIGINS`. Check the terminal for errors.                                                            |
| A phone or tablet cannot connect                    | The server listens on this computer only by default. See "Control it from a phone or tablet" above.                                                                 |
| Top bar says **DMX not connected**                  | The device was unplugged, the wrong port was chosen, or another program is using it. Close other DMX software, re-plug, then reconnect on the **Output** screen.    |
| `Permission denied` opening the serial port (Linux) | Add your user to the `dialout` group (see step 4) and log back in.                                                                                                  |
| Lights do not respond but the app shows output      | Check the fixture's DMX address and mode match the studio's **Setup** screen, the cable is firmly connected, and Master is above 0 and Blackout is off.             |
| Want to start over                                  | Stop the server and delete `server/data/project.json` (a copy of the previous save is kept as `project.json.bak`).                                                  |

## Security note

The server has **no login**. It listens only on the loopback address unless you set `HOST`. Run it on your own machine
or a trusted local network, and do not expose it to the internet. To report a vulnerability, see
[SECURITY.md](../SECURITY.md).
