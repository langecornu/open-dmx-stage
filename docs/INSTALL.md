# Install guide

Open DMX Stage is a Node.js server plus a React web app. It runs on macOS, Windows and Linux. You do not need any
lighting hardware to try it: without a DMX interface it runs in **simulator mode**.

## 1. Requirements

### Software

| Dependency                    | Version                                 | Notes                                                                                                                             |
| ----------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [Node.js](https://nodejs.org) | 24 LTS (recommended)                    | The project pins `>=24` in `package.json` and `.nvmrc`. It also runs on Node 20 for development, but 24 is the supported version. |
| npm                           | 10 or newer                             | Installed with Node.js.                                                                                                           |
| A modern browser              | Current Chrome, Edge, Firefox or Safari | The app is a normal web page; nothing to install in the browser.                                                                  |
| Git                           | Any recent version                      | Only needed to clone the repository.                                                                                              |

Check what you have:

```bash
node --version   # v24.x.x recommended
npm --version
```

If you manage Node versions with [nvm](https://github.com/nvm-sh/nvm), run `nvm install && nvm use` in the project
folder and it picks up `.nvmrc`.

### Hardware (optional, for real lights)

| Item                     | Notes                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| USB to DMX interface     | An **ENTTEC DMX USB Pro** or a compatible interface that speaks the same protocol. The cheaper "Open DMX USB" style dongles are **not** supported yet. |
| DMX cable                | 3-pin or 5-pin XLR, matching your interface and fixtures.                                                                                              |
| At least one DMX fixture | Set its DMX address and mode on the fixture itself (the studio assigns addresses in the app; they must match).                                         |
| DMX terminator           | A 120 Ω terminator on the last fixture in the chain is good practice on long runs.                                                                     |

### Native package

Serial access uses the [`serialport`](https://serialport.io) package. It is installed as an _optional_ dependency and
ships prebuilt binaries for common platforms, so a normal `npm install` needs no compiler. If it cannot be installed on
your machine, everything still works in simulator mode.

## 2. Get the code and install

```bash
git clone https://github.com/langecornu2027/open-dmx-stage.git
cd open-dmx-stage
npm install
```

(Use `npm ci` instead of `npm install` for an exact, reproducible install from the lockfile.)

## 3. Run it (simulator mode)

```bash
npm run dev
```

Then open **http://localhost:5173**.

- The API listens on port **4000**, the web app on **5173**.
- The top bar shows **Simulator**, which means nothing is sent to real lights yet.
- On first run a short welcome screen helps you add your lights. See the [usage guide](USAGE.md).

## 4. Connect real DMX lights

1. Plug in the DMX interface and connect the DMX cable to your first fixture.
2. Find the interface's serial port:
   - **macOS:** `ls /dev/tty.usbserial-*` (an ENTTEC Pro typically looks like `/dev/tty.usbserial-EN123456`).
   - **Linux:** `ls /dev/ttyUSB*`. Add yourself to the serial group once, then log out and in:
     `sudo usermod -aG dialout $USER`.
   - **Windows:** open Device Manager, expand _Ports (COM & LPT)_, and note the COM number (for example `COM3`).
   - If the port does not appear, install the interface vendor's FTDI driver and re-plug the device.
3. Start the server with the driver and port set:

   ```bash
   # macOS / Linux
   DMX_DRIVER=enttec-pro DMX_SERIAL_PATH=/dev/tty.usbserial-EN123456 npm run dev
   ```

   ```powershell
   # Windows PowerShell
   $env:DMX_DRIVER = "enttec-pro"; $env:DMX_SERIAL_PATH = "COM3"; npm run dev
   ```

4. The top bar should now show **DMX ready**. Move a colour in the **Lights** screen and the fixture should react.

You can also list candidate ports from the running server: open http://localhost:4000/api/output/ports.

## 5. Configuration

Settings are environment variables. Copy `.env.example` for reference; the app reads the real environment (export the
variables, or set them in your process manager). Nothing is required.

| Variable          | Default                 | Meaning                                                              |
| ----------------- | ----------------------- | -------------------------------------------------------------------- |
| `PORT`            | `4000`                  | API and WebSocket port.                                              |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | Comma-separated browser origins allowed to talk to the API.          |
| `DMX_DRIVER`      | `mock`                  | `mock` (simulator) or `enttec-pro`.                                  |
| `DMX_SERIAL_PATH` | _(empty)_               | Serial path of the interface. Required when `DMX_DRIVER=enttec-pro`. |
| `DMX_FRAME_RATE`  | `30`                    | DMX frames per second, 1 to 44.                                      |
| `DATA_DIR`        | `server/data`           | Where `project.json` (your show) is stored.                          |

## 6. Production build (single port)

```bash
npm run build
npm start
```

Open **http://localhost:4000**. The server serves the built app and the API from the same port. For a venue laptop or a
Raspberry Pi this is the simplest way to run it.

## 7. Verify the install

```bash
npm test        # unit and API tests
npm run lint    # code style
```

## 8. Troubleshooting

| Symptom                                             | Fix                                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EBADENGINE` warning on `npm install`               | You are on Node older than 24. It still runs on Node 20; install Node 24 to remove the warning.                                                                     |
| Port 5173 is already in use                         | Run the web app on another port and allow it: `ALLOWED_ORIGINS=http://localhost:5180 npm run dev:api` in one terminal, `npm run dev:web -- --port 5180` in another. |
| Top bar says **Server offline**                     | The API is not running or the browser origin is not in `ALLOWED_ORIGINS`. Check the terminal for errors.                                                            |
| Top bar says **DMX not connected**                  | Wrong `DMX_SERIAL_PATH`, the device was unplugged, or the port is in use by another program. Close other DMX software and re-plug.                                  |
| `Permission denied` opening the serial port (Linux) | Add your user to the `dialout` group (see step 4) and log back in.                                                                                                  |
| Lights do not respond but the app shows output      | Check the fixture's DMX address and mode match the studio's **Setup** screen, the cable is firmly connected, and Master is above 0 and Blackout is off.             |
| Want to start over                                  | Stop the server and delete `server/data/project.json`.                                                                                                              |

## Security note

The server has **no login**. Run it on your own machine or a trusted local network, and do not expose it to the
internet.
