# First light: testing your lights for the first time

This is a short checklist for the very first time you connect real lights. Nothing in Open DMX Stage has been verified
on real hardware yet, so the point of this page is twofold: to get your lights working, and to record what happened so
the documentation can say what is known to work. Allow about 30 minutes.

If something goes wrong, nothing here can hurt the lights: the app only sends standard DMX values. Still, keep the
moving head clear of people and objects, and never open a light that is plugged in.

## What you need

- The computer running the app, with **Node 24.15 or newer** (`node -v` shows the version; `nvm use 24` switches).
- A **passive USB-DMX cable** (for example the DSD TECH SH-RS09B), and a **DMX cable** from it to the first light. Most
  lights use 3-pin XLR; the cable is not the same as a microphone cable, though the plugs look alike.
- The lights, powered, and a way to link them in a chain: DMX **OUT** of one light to DMX **IN** of the next.

```
computer --USB--> [USB-DMX cable] --DMX--> IN [Par 1] OUT --DMX--> IN [Par 2] OUT --DMX--> IN [Moving head]
```

## 1. Set each light to DMX mode and an address

Every light has a small display and four buttons (MENU, UP, DOWN, ENTER). The starter show in this repository,
[`docs/examples/my-rig.json`](examples/my-rig.json), expects:

| Light       | Mode on the display      | Address  | Channels used |
| ----------- | ------------------------ | -------- | ------------- |
| Par 1       | DMX, 7 channel           | **A001** | 1 to 7        |
| Par 2       | DMX, 7 channel           | **A008** | 8 to 14       |
| Moving head | DMX, **CH13** (13 chan.) | **A020** | 20 to 32      |

Check the manual of each light for the exact menu names. **If your pars show a different number of channels** (for
example 3 or 6), the starter show will not match them: in Setup remove the pars and add the fixture that fits, or tell
me the channel table and I will add it.

## 2. Start the app

```bash
nvm use 24
npm install
npm run dev          # or: npm run build && npm start   (then open http://localhost:4000)
```

Open the address shown. The top bar says **Simulator**, which means nothing goes to the lights yet.

## 3. Load the starter show

1. Open **Setup**, scroll to **Your show**, press **Import show**, and choose
   [`docs/examples/my-rig.json`](examples/my-rig.json).
2. Check Setup lists **Par 1** (DMX 1 to 7), **Par 2** (8 to 14) and **Moving head** (20 to 32).

It also contains four looks (Warm white, Cool blue, Red alert, Pars only), a sequence timed in beats, and two groups.
Every look keeps the moving head centred, because a look that does not mention pan and tilt would send them to 0.

## 4. Connect the output

1. Plug in the USB-DMX cable.
2. Open **Output**. In **Connection**, choose **USB-DMX cable**, press **Refresh**, and choose the cable's serial port
   (on a Mac it looks like `/dev/tty.usbserial-XXXXXXXX`; on Windows `COM3`).
3. Press **Detect adapter**. A passive cable should answer that it **did not answer**, which is what a passive cable
   does, and the app keeps **USB-DMX cable** selected. If it says it answered like an ENTTEC Pro, your cable has its own
   processor: choose **ENTTEC DMX USB Pro** instead.
4. Press **Connect**. The top bar should change to **DMX ready**.

## 5. Check the lights

1. On **Output**, press **Test lights**. Every light in the show should go **red, green, blue, white**, changing every
   second or so. Press it again to stop.
2. On **Lights**, press a colour, move the brightness, tap one fixture to colour only that one.
3. On **Looks**, play **Warm white**, **Cool blue** and **Red alert**. On **Perform**, try the keys `1` to `5`, Space
   for blackout, and the tempo and effects (Pulse, Sweep, Rainbow).
4. The moving head: on **Lights**, open the head's **Channels** and move **Pan** and **Tilt** a little at a time.
   **Do not touch the last two channels** ("Programs and sound" and "Reset"): they are kept at 0 on purpose, and a
   value of 250 or more on Reset makes the head restart.

## If something does not work

| What you see                                              | Try this                                                                                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The top bar says **Server offline**                       | The server is not running, or you opened the page from another address. Use the address the terminal prints.                                                             |
| **Test lights** is greyed out                             | The show has no lights yet. Import the starter show (step 3).                                                                                                            |
| The port is not in the list, or "That port was not found" | Unplug and replug the cable, press **Refresh**. On Windows the FTDI driver may need installing.                                                                          |
| **Connect** says "Another program is using this cable"    | Close the other program, or unplug and replug the cable, then press **Connect** again.                                                                                   |
| **DMX ready** but no light reacts                         | Check the cable direction (computer to **IN** of the first light), the DMX mode and address on each display, and try a different DMX cable.                              |
| Lights flicker                                            | Passive cables are timed by software. Close other busy programs, try a USB port straight on the computer, and add a 120 ohm terminator to the **OUT** of the last light. |
| One light shows the wrong colours                         | Its mode or address on the display does not match the show. Compare it with step 1.                                                                                      |
| "This computer did not allow access to the port"          | On Linux add your user to the `dialout` group and log in again; see the connection guide for your system.                                                                |
| A par is stuck in an automatic or sound program           | Its display is in auto or sound mode, not DMX. Set it to DMX.                                                                                                            |
| The moving head restarted                                 | Channel 13 (Reset) was set to 250 or more. Return it to 0.                                                                                                               |

## Optional: test the cable without the app

This runs the same driver the app uses and ramps the first channels up for a few seconds:

```bash
npm run dmx:ramp -- --list
npm run dmx:ramp -- --driver open-dmx --port /dev/tty.usbserial-XXXXXXXX --channels 4 --seconds 8
```

`--channels 4` raises channels 1 to 4 together. That matters for lights whose first channel is a master dimmer (your
7 channel pars: dimmer, red, green, blue), which stay dark until a colour channel is up as well. Watch the light on
address 1 get brighter. The script blanks the output when it finishes.

## Please report what you saw

Copy this and fill it in (a message to the maintainer, or an issue on the repository):

```
Computer and system:        (for example MacBook, macOS 15)
Node version:               (node -v)
USB-DMX cable:              (brand and model)
Detect adapter said:        (passive / active / error text)
Connected and "DMX ready":  yes / no
Test lights:                worked / partly / not at all    (what you saw)
Par lights (mode, address):
Moving head works:          yes / no                       (pan, tilt, colours, anything odd)
Flicker or dropouts:        none / some                    (when)
Anything else:
```

With a result, the USB-output decision record ([ADR 0003](adr/0003-passive-usb-cables-are-software-timed.md)) and the
connection guide can state what has been verified instead of what is expected.
