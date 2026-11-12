# Changelog

All notable changes are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Each venue remembers its output**: the USB cable at one venue, Art-Net to a node at another. Leaving a venue
  remembers the output in use there; switching to a venue sets its output again, and the question before switching
  says when the output will change. The Venues card shows each venue's output.
- **AI shows**: Claude designs looks and sequences for the venue you are at, using everything its lights can do
  (colour, movement, gobos, prisms, beam, smoke, built-in programs). Let the AI decide everything, or steer it with a
  mood, the energy, colours to use more, less or avoid, and More, Less or Off for each thing the venue's lights can do.
  Optionally pick a song: its tempo, first downbeat and energy map are worked out in the browser (the audio is never
  sent) and one sequence follows the whole song, starting at its tempo. New looks and sequences are marked as AI-made
  and can be removed in one go. Uses your own Anthropic API key, pasted once on the new **Settings** screen and never
  shown again (or `ANTHROPIC_API_KEY` on the server). See ADR 0007.
- When a save fails because the app was updated while the page was open, it now says to reload the page.
- **Shows: open, new, save as, import**: a **Shows** button beside the show name opens the show list. Open another
  show, start a **New show**, **Save as** to carry on in a copy under another name, delete a show, export the open one
  or import a file. Importing a file now adds it as a show of its own instead of replacing yours, and the show you
  were on always goes to the list, saved. The other shows live in `server/data/shows/`.
- **Venues**: one show, several rigs. Each venue has its own lights, addresses and groups; looks and sequences are
  shared. Add a venue empty or as a copy of this one, then switch with the venue picker in the top bar or the new
  **Venues** card on Setup. Switching says which lights match, then moves looks and blocks onto that venue's addresses;
  what a light without a match does is kept aside and comes back at a venue that has it. The saved show format moves
  to version 6; older shows get one venue, "My venue".
- **One sequence, two views**: Steps and Timeline are now two views of the same sequence instead of two kinds. A
  sequence is a chain of looks (steps) and, optionally, blocks drawn per light over them; switch views at any time and
  edit either. The Timeline view shows the steps on a **Looks** lane (click one to edit its look, fade and hold, drag
  its edge to hold longer, **Add step**), with the light lanes under it; the Steps view says under each step which
  blocks play during it. Where a light has no block, the look shows. Sequences timed in seconds draw on a grid of
  seconds. Existing timelines become sequences of blocks, with nothing lost; the saved show format moves to version 5.
- **Export and import a sequence**: **Export** saves one sequence, with its looks and lights, as a file of its own;
  **Import sequence** adds it to another show and matches its lights to that rig (by name, then by fixture and mode),
  moving looks and blocks onto the rig's addresses, so a sequence made for one venue plays at another. Identical looks
  are reused, and the app says which lights had no match.
- **Everything a light can do**: fixtures now describe what each range of a channel's values does (from the Open
  Fixture Library, QLC+ files and maker manuals, or entered under **Ranges** in the fixture editor), and many more
  channel kinds are known (cold and warm white, lime, CMY, colour temperature and macros, fine pan and tilt, prisms,
  frost, iris, zoom, focus, fog, fans and more). Lights gets **More controls** for the selected lights, and timeline
  blocks get **What else the lights do**: pan, tilt, gobos, colour wheel slots, shutter, zoom, fog output and the rest,
  grouped, with start and end values that fade across a block. New built-in smoke machine and hazer.
- **Device types with icons**: every light has a type (par, spot, moving head, scanner, LED bar, matrix, strobe,
  blinder, effect, flower, mirror ball, laser, smoke machine, hazer, fan, special effect, dimmer, or other), guessed
  from its fixture and changeable when adding it, in Setup and in the fixture editor. An icon of the type shows beside
  the light's name everywhere, with its light-emitting part in colour.
- **Longer timelines**: a timeline can be up to 64 bars long (was 16). It opens fitted to the width, with thin beats;
  **+** and **−** (or Ctrl or ⌘ and the mouse wheel) zoom in and out. Zoomed in, the mouse wheel, dragging the bar numbers
  or the always-visible scrollbar move along the timeline, the light names stay in view, and the grid follows the
  playhead. Timeline mode uses the whole width of the window.
  **Repeat** copies the selected blocks straight after themselves to carry a pattern on. Shortening a timeline asks
  before removing or cutting blocks.
- **Looks: fill lights added later**: when lights were added after your looks were saved, the Looks screen offers to
  set them in every look like a light of the same kind, in rig order (Par 1 → Par 3, Par 2 → Par 4), keeping each
  look's pattern. Setup names the lights that are in no group.
- **Timeline sequences**: draw a sequence instead of listing it, with a **Steps / Timeline** toggle on Sequences. A
  timeline has a lane for each light on a grid of beats: drag across lanes to draw blocks, then set their colour,
  intensity, a fade to another colour and intensity, and a strobe with its speed. Blocks can be moved and resized by
  dragging or from the keyboard. Timelines loop to the tempo, play from Perform, Home, the search palette and MIDI, and
  show in the On stage bar. The saved show format moves to version 4; older shows are upgraded when they are opened.
- **Auto show**: plays your looks or your sequences by itself at the tempo, changing every 1, 2, 4 or 8 bars, in order
  or shuffled, until you stop it. No music needed. Looks cross-fade over one beat and looks that leave every light off
  are skipped. Start it from the new card on Perform or from the search palette; the On stage bar shows it with
  **Stop**, and pressing a pad takes over.
- **Mute and solo for each light**: a card on Perform mutes a light (dark whatever plays, position still moves) or solos
  it (only soloed lights are lit). The On stage bar reminds you with **Clear** while any is set, and the search palette
  can clear them. Live only, not saved with the show.
- **Setup: live lamps and the next free address**: each light in your rig glows in the colour it is really sending, and
  the add bar says which DMX address is free next for the chosen light and quantity.
- **Sequences: faster building**: Add step carries on with the next look and the same timing as the last step, steps
  can be duplicated, and a whole sequence can be duplicated.
- **Looks: a live capture strip** shows a swatch of what the lights are doing right now beside the name field, and each
  look card can be duplicated or updated to what is on stage now, without saving a new one.
- **Fixtures: filter and channel counts**: a filter box searches both lists by name or maker, and each fixture shows how
  many channels it uses.
- **Keyboard shortcut list**: press **?** anywhere, or search for "keyboard shortcuts", to see every key you can press.
- Empty screens show an icon, say what to do next, and use one consistent style.
- **Output: choose how the signal leaves** with cards for the simulator, USB-DMX cable, ENTTEC Pro, Art-Net and sACN, each
  with an icon and a one-line explanation, instead of plain pills.
- **A live stage view on every screen**, beside the On stage bar: each light is drawn as a lamp with a cone of light in the
  colour it is really sending, updated with the DMX frame.
- **A DMX map on Setup**: the 512 channels with a block for each light, an outline where lights overlap, and the next free
  address.
- **Brief confirmations** ("Play Ocean") when a command from the search palette runs, and a branded loading screen.
- **Richer sequence list**: each sequence shows a strip of its colours, its step count and its length.
- **A redesign of the whole app.** A refreshed design language for both themes (graphite or paper, one accent, hairline
  borders, calmer type, soft motion) and a new structure:
  - **Home**, the new first screen: output, rig and tempo cards, a getting-started checklist, and quick-launch pads.
  - **Search (Ctrl or Command + K)**: jump to a screen, play a look, start or stop a sequence, or run an action.
  - A navigation rail with the output status at the bottom, and a top bar with Search, Master and Blackout.
  - **Lights** has big fixture cards, **Select all**, and a colour and brightness inspector beside them.
- **An "On stage" bar on every screen.** It says what is playing and where it came from (a sequence with its step, a
  look, or manual changes), shows an effect or manual changes running underneath, and has one obvious **Stop** (or
  **Reset**) button. During a blackout the bar turns red, says the lights are off, and has a **Lights on** button.

### Changed

- **The server listens on your network by default** (`HOST=0.0.0.0`), so a phone or tablet on the same network can
  open the app at this computer's address or name and run the show, with no extra settings: the computer's own
  addresses are now trusted for the live link. The control surface still has no login; set `HOST=127.0.0.1` to keep
  it on this computer (ADR 0008, superseding ADR 0005).

- **Perform is a denser stage console.** A status strip at the top shows the output, the MIDI controller and whether the
  page is listening to the music, each with a dot and words, and jumps to its settings. Beside it, the tempo and four
  beat lamps that pulse at its speed. Pads are smaller so more fit on screen; each shows what it is, and a sequence pad
  has a strip of its step colours with the step on stage lit. The Home quick-launch pads match.
- **Perform is a stage console.** Looks and sequences sit in their own rows with their counts, the playing pad says **On
  stage**, the keyboard shortcuts are listed at the top, and tempo (a large readout), effects, sound and MIDI sit in a
  tidy row below. Master, blackout and stop were repeated here; they now live only in the top bar and the On stage bar,
  and the buttons to link them to a MIDI controller appear while learning.
- **Calmer, more guided shell.** The navigation is grouped under **Show** (Lights, Looks, Sequences, Perform) and
  **Rig** (Setup, Fixtures, Output), and a pulsing dot marks the screens that have something running. The top bar shows
  a **Fix** button that opens Output when the lights are not connected, and the Saved note is quiet until there is
  something to worry about.
- The Output screen says **Using: Open DMX (simple USB cable)** rather than "Active", which read like the cable type.

### Fixed

- **Look cards counted every light in the rig** ("4 fixtures") instead of the lights the look sets. They now say, for
  example, **2 of 4 lights**, and name the lights the look leaves dark.
- **A look left on stage can be stopped.** When a sequence that plays once ends, or after a look is played, the On
  stage bar now has a **Stop** button (and the search palette a **Stop the look** command) that takes the look off
  stage and returns the lights to rest. Before, the bar showed the look with no way to stop it.
- **The server could hang while stopping and keep port 4000 busy.** With the app open in a browser, Ctrl+C or a
  restart during development waited forever ("Waiting for graceful termination"), so the next start could not use the
  port. Stopping now disconnects the browsers (they reconnect when the server is back), always ends within 3 seconds
  even if the USB output hangs, and a second Ctrl+C quits at once.
- **Follow the music did not lock on real music** ("waiting for a steady beat"). It counted bass hits, which fails when a
  bass line is held under the kick, when snares and hi-hats add hits, or when a laptop microphone hears little bass. It
  now measures how hard the sound hits in the low band and the whole sound, and finds the tempo from how that pattern
  repeats, the way beat trackers do. While it waits, the panel shows how many beats it has heard and the strongest
  rhythm so far.

- **Stop sequence did nothing when no sequence was playing, and gave no hint why.** The Perform screen now has one button
  that says **Play sequence** when nothing plays and becomes **Stop sequence** while a sequence runs, a line that says what
  is playing, and a **Blackout is on** label (with a note that the lights are dark) so a blackout is not mistaken for a
  stopped show. While learning MIDI, a separate **Link stop to a pad** button keeps stop linkable.
- **"Rests at" values were never applied.** A fixture's resting values (a moving head's pan and tilt at the centre, a
  dimmer open) were shown on the Fixtures screen but the output used 0 for any channel a look did not set, sending a
  pan and tilt to a corner. Lights now sit at their resting values until a look sets something else, a look that does
  not mention a channel leaves it there, and saving a look keeps a deliberate 0 for channels that rest above 0. Looks
  saved earlier simply leave such channels at rest when played.
- **Art-Net and sACN did not blank the lights when closing:** the last frame, which sets every channel to zero, was lost
  because the socket closed before it was sent, so lights kept their last look when the output was switched or the app
  stopped. The drivers now wait for pending sends before closing (with a short limit).
- The built app served by `npm start` could not open its live link with default settings, so it said "Server offline" and
  faders, blackout and the lights test did nothing. The server's own address is now always trusted.

### Added

- **Demo light show** for two 36 LED pars: a show file with 13 looks, 4 sequences (one in seconds, three in beats) and 3
  groups ([docs/examples/pars-demo-show.json](docs/examples/pars-demo-show.json)), and `npm run demo:show`, which plays a
  two-minute routine through the live link using looks with fades, hand-mixed colours, master dimming, the pulse, sweep
  and rainbow effects on all lights and on one group, tempo changes, sequences in seconds and in beats, strobe and
  blackout. `--no-strobe` leaves out the flashing, `--dry-run` prints the plan, `--load` loads the show first.

### Verified

- **USB output on real lights:** a DSD TECH SH-RS09B passive cable on a Mac (macOS 26, Apple silicon, Node 24) drove two
  LED par lights with steady colours, brightness and no flicker. See the first light checklist and ADR 0003. Not yet
  verified: other computers and operating systems, ENTTEC Pro adapters, Art-Net and sACN on real lights, the moving head.

### Added

- **Follow the music:** a panel on Perform that listens to the microphone or a browser tab's sound, finds the beat (the
  low frequencies, measured on the audio thread so it keeps working when the page is in the background) and sets the
  tempo, so the effects and the sequences timed in beats keep time with the music. The sound is analysed in the page and
  is never recorded or sent anywhere. Tried with a synthetic 128 and 100 beats per minute track in a real browser; not yet
  with real music.
- **First light checklist** ([docs/FIRST_LIGHT.md](docs/FIRST_LIGHT.md)) with a starter show to import
  ([docs/examples/my-rig.json](docs/examples/my-rig.json)), and `--channels` for `npm run dmx:ramp`.
- **Find a fixture online:** search the Open Fixture Library from the Fixtures screen and copy a light's modes and
  channels into your fixtures, with credit to the library and its authors in the description. Only the search words
  are sent, to one fixed host; `OFL_ENABLED=false` turns it off. Entries that only redirect to another brand are
  followed. **View details** shows a light's authors, specifications, links and every mode and channel with its value
  ranges before you add it. Pixel and matrix modes are marked and left out for now.
- Channels the library defines through pixel templates (for example "Red Master") are now imported with the right type,
  so colour and master controls work on them.
- **Tempo and tap tempo:** a shared tempo (30 to 300 beats per minute) set by typing, tapping (button or the `.` key)
  or halving and doubling it.
- **Effects:** pulse, sweep and rainbow, locked to the tempo, over all lights or one group. Live only; not saved.
- **Fixture groups** in Setup, used to aim effects at part of the rig.
- **Sequences in beats:** a sequence can time its steps in beats and follow the tempo.
- **Fixtures screen:** write your own fixture definitions by hand: manufacturer, model, description, and the channels of
  each mode (name, what it does, resting value; add, reorder and remove). Built-in fixtures are read-only examples you
  can copy. Your fixtures are saved in the show file. Fixtures have a new `description` field (optional in older shows).
- **More built-in fixtures, from maker manuals:** 36 LED RGB par (7 channel), Mini Spider Light (7 channel) and Mini Moving
  Head Gobo Light (12 and 10 channel). Reset and program channels rest at 0 and are never scaled by master. Tried on real
  lights: the 36 LED par profile works (channels 1 to 5 checked: dimmer, red, green, blue and strobe); the others have not been tried yet.
- **U`King 40W RGBW Moving Head Light** built-in fixture (13 channel mode, from the maker's manual) and the worked
  example for the Fixtures screen. Not yet tried on the real light.

- **Perform screen:** big buttons for every look and sequence, keyboard shortcuts (Space blackout, Escape stop, [ and ]
  master), and MIDI controller mapping with learn mode (pads to looks and sequences, a knob to the master). MIDI
  links are saved in the browser.
- **Detect adapter:** asks a USB adapter to identify itself (the ENTTEC Pro query) and selects the matching interface;
  a passive cable stays silent (tried on one passive cable; not yet on an active adapter).
- **Test lights:** cycles every patched fixture through red, green, blue and white from the Connection card.

### Changed

- Server errors (5xx) can now carry a message written for the person to read (for example that the online library is
  unreachable); all other 5xx errors still show a generic message.
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

[Unreleased]: https://github.com/langecornu/open-dmx-stage/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/langecornu/open-dmx-stage/releases/tag/v0.1.0
