# Usage guide

A quick tour of Open DMX Stage. If you have not installed it yet, start with the [install guide](INSTALL.md).

The app has six screens, reached from the left rail (or the bottom bar on phones and tablets):

| Screen        | What it is for                                                  |
| ------------- | --------------------------------------------------------------- |
| **Lights**    | Pick colours and brightness and see your fixtures respond live. |
| **Looks**     | Save what is on stage and bring it back with one tap.           |
| **Sequences** | Chain looks into a show with timed fades.                       |
| **Perform**   | Run a show with big buttons, keyboard shortcuts and MIDI.       |
| **Setup**     | Tell the studio which lights you have and their DMX addresses.  |
| **Output**    | See exactly what is being sent on the DMX line.                 |

The top bar is always available: the show name (click to rename), the connection status, the **Master** brightness,
the light/dark **theme switch**, and **Blackout**.

## 1. First run: the welcome screen

The first time you open the app with an empty rig, a short welcome helps you get set up.

![Welcome screen](images/01-welcome.jpg)

Choose **Get started**, then say how many of each light you have. Addresses are assigned automatically, one after
another, so fixtures never overlap.

![Choosing your lights](images/02-pick-lights.jpg)

Finish with **Start lighting**. You can skip the welcome and add lights later in **Setup**.

## 2. Lights: colour and brightness

Open **Lights**. The studio at the top has quick colour swatches, a rainbow swatch for any custom colour, and a
**Brightness** slider. Pick a colour and your fixtures change immediately.

![Lights screen, light theme](images/03-lights-light.jpg)

- **Which fixtures?** With nothing selected, changes apply to _all_ fixtures ("Applies to: all fixtures"). Tap
  fixture tiles to select just those ones ("Applies to: 2 selected"). Use **Clear selection** to go back to all.
- **Each tile** shows a glowing orb of the colour that fixture is emitting right now.
- **Fine control:** open **Channels** on a tile to move individual DMX channel faders (dimmer, red, green, pan, tilt
  and so on).
- **Reset manual changes** drops every manual fader or colour override and returns control to the running look or
  sequence.

> Fixtures with a dimmer channel keep the colour pure and use the dimmer for brightness. Fixtures without one scale the
> colour itself.

The same screen in the dark theme:

![Lights screen, dark theme](images/04-lights-dark.jpg)

## 3. Looks: save and recall

Once the lights look right, open **Looks**, give the look a name and choose **Save current look**. Each saved look
becomes a card with a preview of its colours.

![Looks screen](images/05-looks.jpg)

- Press the round **play** button on a card to bring that look up.
- **Fade when playing** sets how long the change takes (instant up to 5 seconds).
- The look currently on stage shows an **On stage** badge.
- Rename a look by clicking its name. Delete it with the bin icon (it is also removed from any sequence).

## 4. Sequences: build a show

A sequence plays looks one after another.

1. Open **Sequences** and choose **New sequence**.
2. Choose **Add step** for each look you want, then pick the look for each step.
3. Set the **Fade** (seconds to transition in) and **Hold** (seconds to stay) for each step.
4. Turn **Loop** on to repeat forever, then press **Play**. Press **Stop** to end it.

![Sequences screen with timeline](images/06-sequences.jpg)

The **timeline** strip shows each look as a block sized by its fade plus hold time, with the fade drawn as a soft ramp.
The step that is playing is highlighted. Use the arrow buttons to reorder steps and the bin to remove one.

## 5. Perform: run a show

**Perform** turns every look and sequence into a big button, for running a show without hunting with the mouse.

- **Tap a button** to play a look (with the fade chosen at the top) or to start a sequence. Tap a playing sequence
  again to stop it.
- **Keyboard shortcuts:** each button shows its key (1 to 0, then Q to P, then A to L). **Space** is blackout,
  **Escape** stops a sequence, and **[** and **]** lower and raise the master by 10%. Shortcuts never fire while you are
  typing in a field.
- **Master, blackout and stop** are always at the top of the screen.

### MIDI controller

If you have a MIDI controller (pads, keys, knobs or faders), you can play looks from it:

1. Use Chrome or Edge, plug in the controller, and press **Turn on MIDI**. The browser asks for permission.
2. Press **Learn MIDI**, tap the button you want to link on the screen, then press a pad or key on the controller.
   The control's name (for example "Note 36 (ch 1)") appears on the button.
3. Press **Done learning**. Now the pad plays that look.
4. To control the master from a knob or fader, turn on learn mode, press **Link master to a knob**, and move the knob.

**Clear links** removes all links. Links are saved in this browser, not in the show file, and links to looks you delete
are forgotten. Safari and Firefox do not support MIDI everywhere, so use Chrome or Edge.

## 6. Setup: your rig

Use **Setup** to manage your fixtures.

![Setup screen](images/07-setup.jpg)

- **Add:** choose a fixture and mode, how many, then **Add to rig**. Addresses are picked for you.
- **Edit:** rename a fixture or change its **DMX** address. A warning badge appears if fixtures overlap or run past
  channel 512.
- **Import fixture file:** load a fixture definition from a QLC+ `.qxf` file or an Open Fixture Library `.json` file.
  Imported fixtures then appear in the **Fixture** list. Only import files whose licence allows your use.
- **Remove:** the bin icon takes a fixture out of the rig.
- **Your show file:** **Export show** downloads your whole show (fixtures, looks and sequences) as a file you can back up
  or move to another computer. **Import show** loads one back in, after asking you to confirm, because it replaces the
  current show. Files from older versions of the app are upgraded automatically.

Make sure each fixture's real DMX address and mode match what is shown here.

## 7. Output: see what is sent

**Output** shows all 512 DMX channels live, after Master and Blackout are applied. Each bar is a level; outlined cells
are channels used by your fixtures. Hover a cell for the fixture and channel name. It is handy for checking addresses
and for confirming that something is really being sent.

The **Connection** card at the top has two helpers for checking your setup:

- **Detect adapter** (for USB adapters): asks the adapter on the chosen port what kind it is and selects the matching
  interface for you. A passive cable stays silent; an adapter with its own processor answers.
- **Test lights:** cycles every light you have added through red, green, blue and white, so you can see at a glance
  that the connection and the DMX addresses are right. Press **Stop test** to put the lights back.

![Output screen](images/08-output-dark.jpg)

### Connecting your lights

The **Connection** card at the top of **Output** chooses how DMX leaves the app: the simulator, a USB-DMX cable, an
ENTTEC DMX USB Pro, Art-Net or sACN. Pick one, choose the serial port (or enter a network address and universe), and
press **Connect**. The status pill shows whether it is active, and any problem is explained in plain words.

Press **How to connect** in that card for a step-by-step guide with diagrams, including how to tell a passive USB cable
from an active adapter. The same guide is in [Connecting your lights](CONNECTION.md).

## 8. Master, Blackout, themes and devices

- **Master** scales the brightness of everything (dimmer and colour channels only; pan and tilt are unaffected).
- **Blackout** switches all light output off at once; press it again to bring it back.
- **Theme:** the sun/moon switch in the top bar changes between light and dark. The choice is remembered.
- **Phone and tablet:** below 900 px wide the navigation moves to a bottom bar and the layout stacks, so you can run
  the show from a phone or tablet on the same network (the server must be set to listen beyond this computer: see the
  [install guide](INSTALL.md#control-it-from-a-phone-or-tablet)).

## 9. Saving

Your show (fixtures, looks, sequences) saves automatically a moment after each change. The top bar shows
_Unsaved_, _Saving…_ or _Saved_. The data lives in `server/data/project.json` on the machine running the server, and the previous save is kept as
`project.json.bak`.

## Current limits

- One DMX universe (512 channels).
- Export to Engine DJ / SoundSwitch is not available yet.
- USB output has not been tested on real hardware yet. Network output (Art-Net and sACN) is the most predictable path.
- SoundSwitch dongles are not supported.
