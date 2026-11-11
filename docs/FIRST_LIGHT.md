# First light: testing your lights for the first time

This is a short checklist for the very first time you connect real lights. The first run on real hardware is recorded at
the end of this page ([what happened](#what-happened-on-the-first-run)); most of Open DMX Stage has still not been tried on
lights, so the point of this page is twofold: to get your lights working, and to record what happened so the
documentation can say what is known to work. Allow about 30 minutes, and longer the first time a light is in an
unexpected mode.

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

| Light       | Mode on the display                | Address  | Channels used |
| ----------- | ---------------------------------- | -------- | ------------- |
| Par 1       | DMX (its address entry, see below) | **001**  | 1 to 7        |
| Par 2       | DMX (its address entry, see below) | **008**  | 8 to 14       |
| Moving head | DMX, **CH13** (13 chan.)           | **A020** | 20 to 32      |

Three things that cost an hour on the first run, so do them in this order:

1. **Lights start in a built-in program, and the cable is ignored until DMX is chosen.** Pars like these cycle through
   programs (a display such as `so04` or `cc01` means a program). Press **MENU** until you reach the address entry, set
   the address with UP and DOWN, and press **ENTER**. The display should stay on the address (for example `d001`).
2. **The menu name may not match what the light does.** The manual of one 36 LED par calls `d001` "3 channel" and `A001`
   "7 channel", but the pars on the first run had no `A001` entry and `d001` behaved as the 7-channel layout (channel 1
   dimmer, 2 red, 3 green, 4 blue). Do not trust the label: use the one-channel-at-a-time test below.
3. **Give each light its own channels, with no overlap.** A 7-channel par takes 7 channels, so the second one goes at 8,
   not 4. Overlapping addresses make lights read each other's data and show odd colours or flicker.

If your lights use a different number of channels from the starter show, remove the pars in Setup and add the fixture
that fits (or describe it on the **Fixtures** screen).

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

| What you see                                                                 | Try this                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The top bar says **Server offline**                                          | The server is not running, or you opened the page from another address. Use the address the terminal prints.                                                                                                                                                                                             |
| **Test lights** is greyed out                                                | The show has no lights yet. Import the starter show (step 3).                                                                                                                                                                                                                                            |
| The port is not in the list, or "That port was not found"                    | Unplug and replug the cable, press **Refresh**. On Windows the FTDI driver may need installing.                                                                                                                                                                                                          |
| **Connect** says "Another program is using this cable"                       | Close the other program, or unplug and replug the cable, then press **Connect** again.                                                                                                                                                                                                                   |
| **DMX ready** but no light reacts                                            | Check the cable direction (computer to **IN** of the first light), the DMX mode and address on each display, and try a different DMX cable.                                                                                                                                                              |
| Lights flicker                                                               | First check that no two lights share channels (a 7-channel par at 4 overlaps one at 1) and that each is in DMX mode with its address confirmed with ENTER. Only then: close other busy programs, try a USB port straight on the computer, and add a 120 ohm terminator to the **OUT** of the last light. |
| One light shows the wrong colours, or another light's colours                | Its address or layout does not match the show. Put **both lights on the same address** and send one channel at a time (see below): each should behave the same, and the colour each channel gives is its true layout.                                                                                    |
| "This computer did not allow access to the port"                             | On Linux add your user to the `dialout` group and log in again; see the connection guide for your system.                                                                                                                                                                                                |
| A par is stuck in a program (display like `so04` or `cc01`, a fixed pattern) | It is not in DMX mode. Go to its address entry, set the address, and press **ENTER**. Unplug the DMX cable: if the pattern stops, the light was reacting to the cable but not decoding it.                                                                                                               |
| The moving head restarted                                                    | Channel 13 (Reset) was set to 250 or more. Return it to 0.                                                                                                                                                                                                                                               |

## Once it works: the demo light show

With two 36 LED pars on addresses 1 and 8 (the starter show's pars), you can play a two-minute demo that uses almost
everything the app does: [`docs/examples/pars-demo-show.json`](examples/pars-demo-show.json) is a show with 13 looks, 4
sequences and 3 groups, and a script plays a routine over it.

```bash
npm run demo:show -- --load              # loads the demo show into the app, then plays it (replaces the current show)
npm run demo:show -- --no-strobe         # the same, without any flashing
npm run demo:show -- --dry-run           # prints the plan without touching the lights
```

It covers looks with fades, hand-mixed colours, master dimming, the pulse, sweep and rainbow effects (on both pars and on
one par), tempo changes, sequences timed in seconds and in beats, strobe and blackout. About 13 seconds of it flashes,
so do not run it near anyone sensitive to flashing light, and use `--no-strobe` if in doubt. Press Ctrl+C at any time to
stop it: the lights go back to rest. The same looks and sequences are on the **Looks**, **Sequences** and **Perform**
screens for you to play by hand, and the effects and tempo are on **Perform**.

## Find out what a light's channels really do

When colours come out wrong, stop guessing and test **one channel at a time**:

1. Put the lights on the **same address**, so they all receive the same data.
2. Send one channel at full (channel 2, say) and see what colour each light shows. A light with a master dimmer on
   channel 1 stays dark until channel 1 is up too, so try channel 1 plus channel 2, then 1 plus 3, then 1 plus 4.
3. Write the layout down (for the pars on the first run: 1 dimmer, 2 red, 3 green, 4 blue), then add the matching
   fixture in Setup or on the **Fixtures** screen.

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

## What happened on the first run

**Recorded 2026-11-10.** Computer: a Mac (macOS 26.6, Apple silicon), Node 24.22. Cable: a DSD TECH SH-RS09B passive USB-DMX
cable (FTDI FT232R, USB 0403:6001), connected with the app's **USB-DMX cable** interface. Lights: two 36 LED RGB par lights.

| Question                  | Result                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Detect adapter said       | It did not answer, as a passive cable does.                                                                                 |
| Connected and "DMX ready" | Yes, at the first try.                                                                                                      |
| Serial settings           | 250000 baud, 8 data bits, no parity, 2 stop bits (read back from the port).                                                 |
| Colours, brightness       | All colours and the brightness slider worked on both pars, steady, once the pars were set up correctly.                     |
| Flicker                   | None once each par had its own addresses. It flickered when the addresses overlapped.                                       |
| Par layout at `d001`      | Channel 1 dimmer, 2 red, 3 green, 4 blue, 5 strobe (tested at 0, 40, 128 and 220 and reported working); 6 and 7 not tested. |
| Moving head               | Not tried yet (not delivered).                                                                                              |

What went wrong along the way, so it is quicker next time:

- The pars started in built-in programs and ignored the cable until their address was set and confirmed with ENTER.
- The display labels did not match the layout (see step 1), and one par's address was off by a few until the lights were
  put on the same address and tested one channel at a time.
- The "flicker" and the odd colours were address overlap and wrong layouts, not the timing of the cable. A different
  way of making the DMX break was tried and made no difference, and the long serial break in the driver stays.
- Not tried: the pars' channels 6 (programs) and 7 (speed), other computers and operating systems, long sessions, ENTTEC Pro adapters, network output on real lights.
