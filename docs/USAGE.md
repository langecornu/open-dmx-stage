# Usage guide

A quick tour of Open DMX Stage. If you have not installed it yet, start with the [install guide](INSTALL.md).

The app has seven screens, reached from the left rail (or the bottom bar on phones and tablets):

| Screen        | What it is for                                                     |
| ------------- | ------------------------------------------------------------------ |
| **Lights**    | Pick colours and brightness and see your fixtures respond live.    |
| **Looks**     | Save what is on stage and bring it back with one tap.              |
| **Sequences** | Chain looks into a show with timed fades.                          |
| **Perform**   | Run a show with big buttons, keyboard shortcuts and MIDI.          |
| **Setup**     | Tell the studio which lights you have and their DMX addresses.     |
| **Fixtures**  | Describe your own lights: brand, model and what each channel does. |
| **Output**    | See exactly what is being sent on the DMX line.                    |

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
5. Optional: change **Timing** from **Seconds** to **Beats** to time steps in beats instead. The fields become **Fade
   (beats)** and **Hold (beats)**, in quarter-beat steps, and the sequence speeds up or slows down with the tempo
   (see Tempo in the Perform section). Switching starts from the same lengths at 120 beats per minute. The tempo is
   read when each step begins, so a change takes effect from the next step.

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
- **Master, blackout and play/stop** are always at the top of the screen. The play button says **Play sequence** when
  nothing is playing (it starts the sequence that played last, or the first one) and becomes **Stop sequence** while one
  plays; a line beside it says what is playing, and when blackout is on it says so, because the lights are dark then.

### Tempo and effects

- **Tempo:** type the beats per minute, or press **Tap tempo** (or the **.** key) in time with the music. The first tap
  lines the beat up, and from the second tap the tempo follows your taps; a pause of two seconds starts a new count.
  **½×** and **2×** halve and double it. The tempo goes from 30 to 300.
- **Effects:** **Pulse** (every light swells on the beat), **Sweep** (a bright spot runs along the lights, in the order
  of your rig) and **Rainbow** (colours cycle through the spectrum, spread along the lights). Choose **All lights** or a
  group, and how many beats one cycle lasts. Press an effect again, or **Stop effect**, to end it. Effects lie over
  the look that is playing; master, blackout and any manual change still win. Pulse and sweep scale brightness, so
  they work with any look; rainbow sets red, green and blue on lights that have them. If you edit a group while an
  effect runs, press the effect again to pick up the change.
- Tempo and effects are live controls and are not saved in the show file.

### Follow the music

The **Follow the music** panel listens to the sound, finds the beat, and sets the tempo from it, so the effects (pulse,
sweep, rainbow) and the sequences timed in beats keep time with the music. Press **Start listening** and choose what to
listen to:

- **The microphone:** use this for music playing in the room. The browser asks for permission the first time.
- **A browser tab's sound:** the cleanest way for music in Chrome. Chrome asks what to share; choose the tab and tick
  **Also share tab audio**. The picture is thrown away and only the sound is used.
- **Music in another app** (Spotify, Music): macOS cannot hand app sound to a browser, so use the microphone, or install
  a loopback input such as BlackHole and choose it under **Microphone**.

The panel says **Listening… waiting for a steady beat** until it has heard about eight beats, then **Following the beat:
128 beats per minute**, and the tempo above follows it. Start an effect (for example **Pulse**) or a sequence timed in
beats (for example the demo show's **Colour cycle**) and it plays in time. It works best with a steady kick drum; music
without a clear beat, or with a changing tempo, may not lock. If the beat is lost for a few seconds the panel goes back to
waiting and leaves the tempo where it was. Press **Stop listening** to let go of the microphone.

The sound is analysed inside the page by the browser and is never recorded or sent anywhere: only the tempo goes to the
server. There is a short delay between a sound and the light (a few tens of milliseconds), which is normal.

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
- **Remove:** the bin icon takes a fixture out of the rig (and out of any group).
- **Groups:** once you have lights, a **Groups** card lets you name sets of them, such as a front row, by ticking the
  lights in each. Effects on the Perform screen can run on just one group.
- **Your show file:** **Export show** downloads your whole show (fixtures, looks and sequences) as a file you can back up
  or move to another computer. **Import show** loads one back in, after asking you to confirm, because it replaces the
  current show. Files from older versions of the app are upgraded automatically.

Make sure each fixture's real DMX address and mode match what is shown here.

**U`King 40W RGBW Moving Head Light:** choose **U'King 40W RGBW Moving Head Light**, mode **13 channel**. On the light's
display set **CH13** (13 channel mode) and its start address (**A001** and so on). The profile follows the maker's
manual: pan and tilt (with fine channels), speed, dimmer, strobe, and red, green, blue and white. Channels 12 and 13
are the light's built-in programs and its reset, so the app keeps them at 0; do not move them. The colour and
brightness controls work as on other lights, and pan and tilt are on the per-channel faders.

## 7. Fixtures: find or describe your lights

If a light is not in the list, find it online or describe it yourself on **Fixtures**.

### Find a fixture online

The **Find a fixture online** box searches the community-made [Open Fixture Library](https://open-fixture-library.org),
which has the channel layouts of thousands of lights.

1. Type a brand, a model or both (for example "uking gobo") and press **Search**. Punctuation does not matter.
2. Press **View details** to see a light before you add it: who wrote the definition, its size, weight and power, links to
   the manual and product page, and every mode with each channel's name, what it does, its resting value and what each
   range of values does. You can add it from there too.
3. Press **Add** next to your light. Its manufacturer, model and every mode are copied into **Your fixtures**, and the
   description credits the library and the people who wrote the definition.
4. In **Setup**, choose it and add it to your rig. Check that the mode matches the one set on the light's display.

Only your search words are sent to the library (through this app's server), nothing from your show. If you are
offline the box tells you so, and everything else keeps working; set `OFL_ENABLED=false` (see the install guide) to turn
the box off completely. Modes that repeat channels for every pixel are not supported yet: they are marked in the details window and left out
when you add the light (the description says which), and a light with only such modes is refused with a message.
Some entries only point to another brand's identical light; the app follows these for you.

### Describe a fixture by hand

If it is not in the library, or you prefer to enter it yourself, you need the channel table from the light's manual.

1. Choose **New fixture** (or open a built-in one and press **Make a copy**).
2. Fill in **Manufacturer**, **Model** and **Description** (for example "U'King", "40W RGBW Moving Head Light",
   "40W Beam Moving Head Light DMX512 RGBW Stage Light").
3. Name the **mode** the way the light's display does (for example "13 channel"), then list its channels in order. For
   each channel give a **Name**, choose **What it does** (dimmer, red, green, blue, white, pan, tilt, strobe, and so
   on) and set **Rests at**, the value the channel sits at when you have not moved it. Use **Add channel**, the arrows
   and the bin to build the list. **Add mode** is for lights with more than one channel layout.
4. In **Setup**, choose your fixture and mode and add it to the rig.

Choosing the right **What it does** matters: colours and the dimmer respond to the colour picker, master and blackout,
while **Other (fixed)** channels are never scaled. Use **Other** for anything that must stay put, with a **Rests at** that is
safe (for example 0 for a reset channel).

The built-in fixtures come from maker manuals: the generic dimmer, RGB and RGBW pars, a 36 LED RGB par (7 channel), a
mini spider light, mini gobo and beam moving heads, and the U'King head. Always check the channel count your light's
display shows before choosing a mode. The built-in **U'King 40W RGBW Moving Head Light** is a worked example: open it to see a real 13 channel layout, then
copy it to make changes. Built-in fixtures cannot be edited. Fixtures you make are saved in the show file (so Export
show takes them along), cannot be deleted while a light in the rig uses them, and cannot lose a mode while in use.

## 8. Output: see what is sent

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

## 9. Master, Blackout, themes and devices

**The On stage bar.** The bar at the bottom of every screen always says what is playing: a sequence (with its step), a
look, or colours set by hand. Press **Stop** there to stop a sequence, **Reset** to drop manual changes, or **Stop
effect** to end an effect. During a blackout it turns red and says the lights are off; press **Lights on** to bring
them back.

- **Master** scales the brightness of everything (dimmer and colour channels only; pan and tilt are unaffected).
- **Blackout** switches all light output off at once; press it again to bring it back.
- **Theme:** the sun/moon switch in the top bar changes between light and dark. The choice is remembered.
- **Phone and tablet:** below 900 px wide the navigation moves to a bottom bar and the layout stacks, so you can run
  the show from a phone or tablet on the same network (the server must be set to listen beyond this computer: see the
  [install guide](INSTALL.md#control-it-from-a-phone-or-tablet)).

## 10. Saving

Your show (fixtures, looks, sequences) saves automatically a moment after each change. The top bar shows
_Unsaved_, _Saving…_ or _Saved_. The data lives in `server/data/project.json` on the machine running the server, and the previous save is kept as
`project.json.bak`.

## Current limits

- One DMX universe (512 channels).
- Export to Engine DJ / SoundSwitch is not available yet.
- USB output has been verified with one passive cable (DSD TECH SH-RS09B) on one Mac with two LED pars. ENTTEC Pro adapters and network output (Art-Net and sACN) have not yet been tried on real lights, and nothing has been tried on Windows or Linux.
- SoundSwitch dongles are not supported.
