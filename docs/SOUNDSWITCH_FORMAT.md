# SoundSwitch / Engine DJ lighting files: what we know

Working notes from analysing a SoundSwitch 2.11.1 project export, so Open DMX Stage can one day write lighting files a
Denon SC Live 4 (Engine OS) plays from a USB drive. This is interoperability work on files we made ourselves. It is
updated as the analysis goes. Each finding is marked:

- **Confirmed**: checked against more than one file, or against a value we set on purpose.
- **Likely**: fits every file seen so far, but not tested against a controlled change.
- **Guess**: an idea to test.

Offsets are hexadecimal. All integers are little-endian.

## Goal

Shows built in Open DMX Stage should play on the SC Live 4 **in time with the beat of any song**, without being tied to
a particular song. In SoundSwitch terms that is an **auto loop**: a lighting loop measured in beats, which the player
runs to the beat of whatever is playing when the song has no script of its own. So the target is:

- **Auto loops** (`SSAutoLoopN.ssfile`) made from our looks and sequences, and the **banks** that name and order them.
- A **venue** (`SoundSwitchVenues.bin`) describing our rig, so the loops drive the right channels.

Per-song scripts (`{UUID}.ssfile`, the `SOUNDSWITCH_ID` tag, the track map) are documented below because they were
decoded along the way, but they are not needed for this goal.

## The samples

All in `Soundswitch export/` (not in git). On macOS a `.ssproj` is a folder:

| Project                       | Saved  | Meant to show                         |
| ----------------------------- | ------ | ------------------------------------- |
| `Demonstration export.ssproj` | 11 Nov | A first export, venue "Demonstration" |
| `blue.ssproj`                 | 11 Nov | A block in blue                       |
| `redblue.ssproj`              | 11 Nov | A red block and a blue block          |
| `redbule transition.ssproj`   | 11 Nov | A red to blue transition              |

The four projects were made on another computer (SoundSwitch does not run on the development Mac). For comparison, the
development Mac also has a SoundSwitch 2.11.1 working project, `~/Music/SoundSwitch/default.ssproj`, left from an
install; it is the same version and holds SoundSwitch's demo content as it ships.

**Confirmed: the colour edits are not in these exports.** Every `.ssfile`, the two auto-loop banks and the four
`recordable/*.dat` files are byte-for-byte the same in all four projects. Only `.ssproj` (a new project id) and the
venue file differ, and the venue only in two 64-bit numbers repeated in its four large records (see Venue). Wherever
SoundSwitch keeps the red, blue and transition blocks, it did not write them into these folders.

**Confirmed: exporting rebuilds files for the chosen venue.** Compared with the working project:

| File                        | Working project | Export | Header word 0x10 |
| --------------------------- | --------------: | -----: | ---------------- |
| `SSAutoLoop1.ssfile`        |          63,316 |  5,988 | 12 → 13          |
| `{4C5F1B0F…}.ssfile`        |          10,663 | 11,307 | 12 → 13          |
| `SoundSwitchVenues.bin`     |         108,925 | 29,986 | 10 → 11          |
| Other demo-track `.ssfile`s |      same bytes |   same | 12, unchanged    |

The working venue file holds two venues, "Blank Venue" and "Demonstration"; the export keeps only the one chosen.

Files in each project:

| File                         | Count | What it seems to be                                                       |
| ---------------------------- | ----: | ------------------------------------------------------------------------- |
| `.ssproj`                    |     1 | JSON: project id, SoundSwitch version (2.11.1), "spectra" display options |
| `{TRACK-UUID}.ssfile`        |     7 | The lighting script for one track                                         |
| `SSAutoLoop1…128.ssfile`     |   128 | Built-in auto loops, played when a track has no script                    |
| `SoundSwitchAutoLoops.bin`   |     1 | Auto-loop banks (names such as "Bank 1 : Dynamic")                        |
| `SoundSwitchAutoLoopsEx.bin` |     1 | Extended auto-loop banks                                                  |
| `SoundSwitchVenues.bin`      |     1 | The venue: fixtures, their channels and patch                             |
| `recordable/*.dat`           |     4 | Unknown, small (129 B to 5.7 KB)                                          |

`{4C5F1B0F-59AB-4715-BECC-9C498727C9DD}.ssfile` is newer (11:54 on 11 Nov) only because the export rebuilt it; it is a
SoundSwitch demo track, not a test made by hand. The seven `{UUID}.ssfile` files are the scripts of the "In App Demo"
tracks.

The exported venue is **"Demonstration"** with a **Chauvet Intimidator Trio** (zones, dimmer, pan, tilt…), not the two
7-channel pars on addresses 1 and 8.

## Common header (all `.ssfile` and `.bin` files)

| Offset | Size | Meaning                                                                           | Status    |
| -----: | ---: | --------------------------------------------------------------------------------- | --------- |
|   0x00 |    4 | Magic `AA AA 09 55` (0x5509AAAA)                                                  | Confirmed |
|   0x04 |    4 | Format version: 3                                                                 | Confirmed |
|   0x08 |    4 | Offset of the trailer (table of contents); 0 in the auto-loop bank files          | Confirmed |
|   0x0C |    4 | Always the trailer offset + 30 (0x1E): start of the trailer's entry list          | Confirmed |
|   0x10 |    4 | Goes up by one when the export rebuilds a file (12 → 13, 10 → 11): a revision?    | Likely    |
|   0x14 |    4 | 1 to 4. The working venue file (two venues) has 3, the exported one (one venue) 1 | Guess     |
|   0x18 |    4 | Always 4: the length in words of the GUID that follows?                           | Guess     |
|   0x1C |   16 | A GUID (Microsoft byte order). Shared by groups of files                          | Confirmed |

Header GUIDs seen:

- `{0122ADB8-E4B9-46C9-96C8-98A7E8F6A5A9}`: every file in the working project, and the exported `{4C5F1B0F…}`.
- `{00590C5E-7286-43EB-A009-D7BBE18834D4}`: the exported venue and the rebuilt auto loops (it is also the venue's id
  inside the scripts' bodies, see below).
- `{4D7F52B7-EB5D-49C6-9FB9-CDB82B591239}`: the demo-track scripts that were copied, not rebuilt.

**Guess:** the GUID of the venue (or venue set) the file was last built for.

## Text

**Confirmed** (venue file, every name checked): a string is

| Size | Meaning                                             |
| ---: | --------------------------------------------------- |
|    4 | `1` (probably "a string is present")                |
|    4 | Number of UTF-16 characters, including a final null |
|  2×n | The characters, UTF-16LE, ending with `00 00`       |

For example "Demonstration" is `01 00 00 00 0E 00 00 00` then 14 UTF-16 characters (13 letters and the null);
"Chauvet" has a count of 8 and "White Zone 1" a count of 13. The word at the very end of every file is the exception:
a 4-byte length then plain ASCII (`07 00 00 00 "Default"`).

## Trailer: a table of contents (all files with a trailer)

At the offset in the header word at 0x08:

| Size | Meaning                                                                                            | Status    |
| ---: | -------------------------------------------------------------------------------------------------- | --------- |
|    2 | `01 00`                                                                                            | Confirmed |
|    4 | 1                                                                                                  | Confirmed |
|    4 | -1 (`FF FF FF FF`)                                                                                 | Confirmed |
|   16 | A type id: `{2979B4E8-7CCE-4151-8BBE-716A8DD523FD}` in every lighting script, another in the venue | Confirmed |
|    4 | 0                                                                                                  | Confirmed |
|    4 | 1                                                                                                  | Confirmed |
|    4 | N, the number of entries                                                                           | Confirmed |
|    4 | -N                                                                                                 | Confirmed |
| 16×N | N entries: `1`, offset of a record, its length (12 in scripts), `0`                                | Confirmed |
|    8 | `1`, `-1`: end of the list                                                                         | Confirmed |
|  4+n | Length then ASCII text: `"Default"` in every file seen                                             | Confirmed |

N is 1 in auto loop 1, 2 in the test file, 3 in the demo tracks and 8 in the venue (with alternating record lengths
0x11B and 0xD2). **Guess:** one entry per fixture lane or per section of the timeline.

## Lighting script body (`.ssfile`)

- **Confirmed:** the venue GUID `{00590C5E…}` appears at 0x40 of the test file's body, so a script names the venue it
  was built for. A script made for one venue probably does not play correctly with another.
- **Confirmed:** in `{4C5F1B0F…}`, the times **95,991** and **104,990** appear together five times (around 0x1EC3,
  0x254A, 0x28F2 and in the record at 0x2A88). **Likely:** they are a block's start and end in milliseconds (a block
  from about 1:36 to 1:45).
- **Likely:** the record at 0x2A4B starts with `0x80000001` and the one at 0x2A90 with `0x80000002`: a numbered record
  with the top bit set, then a pointer to just after itself (0x2A4F, 0x2A94).
- **Confirmed:** the record at 0x2A4B holds four 64-bit floats: 0.87, 0.87, 0.62, 0.62. **Guess:** levels or a
  colour/intensity curve at the two ends of the block.
- **Guess:** the body from 0x7C onwards is a list of small keyframe records:
  `00 | 02 00 00 00 | time | time | value` (for example times 0x0E10, 0x0F3A, 0x6016, 0x6141 and values such as
  `FFFFA000`, `FFFFFFFF`, `7FFFFFFF`).

## A hand-made script: `default export 4.ssproj`

The fifth export (`default export 4.ssproj`) is the first with content made by hand. Compared with `blue.ssproj`:

- **New:** `{DE61C185-CF6E-4FED-917F-3566DCD988FA}.ssfile` (2,389 bytes), the script of a song scripted by hand.
- **New:** `SoundSwitchTrackMap.bin` (5,644 bytes), see below.
- **Changed:** the venue file (29,986 → 70,912 bytes: the venue now has more fixtures, positions and cues) and auto
  loops 1 to 32 (rebuilt, about twice as large).

### Script header

`AA AA 09 55`, version 3, trailer offset **0** (no table of contents, unlike the demo-track scripts), 13, 1, 4, and
the venue GUID `{00590C5E…}`. **Likely:** a script without a table of contents is valid; the player reads it from the
start.

### Timed blocks (Confirmed)

The body is a sequence of records separated by the marker **`80 80 80 80`** (0x80808080). Each block's section starts
with a number and `4`: `0x0A` (at 0x34), `0x0B` (0x1BC), `0x0C` (0x344) and `0x0D` (0x4CC).

A block is `1`, start time, end time, then the value at the start and the value at the end:

| Offset | Start (ms)      | End (ms)         | Start value / end value  | Reading                      |
| -----: | --------------- | ---------------- | ------------------------ | ---------------------------- |
|   0x70 | 3,560 (0:03.6)  | 39,366 (0:39.4)  | `FFFA0710` twice         | Colour R 250 G 7 B 16, red   |
|  0x1FC | 40,586 (0:40.6) | 63,779 (1:03.8)  | `FF07FA1D` twice         | Colour R 7 G 250 B 29, green |
|  0x494 | 4,679 (0:04.7)  | 88,497 (1:28.5)  | 64-bit floats 10.0, 90.0 | Strobe, setting 10 → 90      |
|  0x50C | 78,427 (1:18.4) | 122,777 (2:02.8) | `FFFA0728` twice         | Colour R 250 G 7 B 40, red   |

**Confirmed by the person who drew them:** a red block, a green block, a red block and a strobe, at those times. So:

- **Confirmed:** times are 32-bit milliseconds from the start of the song.
- **Confirmed:** colours are 32-bit ARGB (alpha `FF`, then red, green, blue; stored as `B G R A`), each followed by
  four zero bytes. Laid side by side, the three 392-byte colour sections (from their `N, 4` word) differ in **only**
  the section number, the two times and these colour bytes (stored twice, as the start and end colour). Nothing else
  in a section depends on the colour. The two reds differ slightly in blue (16 and 40), as a colour picked by hand
  would.
- **Confirmed:** a strobe block stores two 64-bit floats instead of colours. **Likely:** its setting (rate, in
  percent?) at the start and at the end of the block, here ramping from 10 to 90.
- **Likely:** a block stores a start and an end value, so a fade (red to blue) is one block with two different
  values, and a static colour repeats the same value.
- **Likely:** after each colour block comes `2`, `1`, then **12** pairs of (16-byte GUID, small number 0 to 11): the
  fixtures or zones the block applies to, each GUID with an index. The same 12 pairs follow every colour block.
- **Confirmed:** near the end (0x83C) comes a second list, of **10** (GUID, index) pairs.
- **Guess:** the numbers `0x0A` to `0x0D` before each block are record numbers or lane ids: each of the four blocks has
  its own (red `0x0A`, green `0x0B`, strobe `0x0C`, red `0x0D`).
- **Confirmed:** the list of 10 (GUID, index) pairs also appears in the demo-track script `{4C5F1B0F…}` (at 0x2AC0),
  so these GUIDs come from the venue, not from the drawing.

Still to confirm: a fade (two different colours in one block), the strobe setting's unit, and what the GUID lists
point to in the venue.

## Track map (`SoundSwitchTrackMap.bin`)

**Confirmed:** a list of songs, each with title, artist, source (for example "Serato") and the full path of the audio
file, as strings (see Text). It lists demo songs, the SoundSwitch demo video, and one song three times: from the
computer's Music folder twice and from a USB drive's `Engine Library/Music/` once. Paths are not reproduced here.
Header: `AA AA 09 55`, version 3, no trailer.

**Confirmed:** the track map does not hold script UUIDs (the link is the ID3 tag, see above). **Confirmed:** after
the path, an entry ends with two 64-bit floats; for the scripted song they are **80.0**, its BPM (as in Engine's
`bpmAnalyzed`), and **2.70**. **Guess:** the time of the first beat, in seconds.

## How a song finds its script: an ID3 tag in the audio file (tag Confirmed, use Likely)

The script's UUID `{DE61C185-CF6E-4FED-917F-3566DCD988FA}` is **not** stored in any project file (not even inside the
script), in the track map, or in any of the four Engine databases. It is in **the song file itself**, as an ID3v2.4
user text frame:

| Bytes                                    | Meaning                                    |
| ---------------------------------------- | ------------------------------------------ |
| `54 58 58 58`                            | Frame id `TXXX` (user-defined text)        |
| `00 00 00 36`                            | Frame size 54 (ID3v2.4 synchsafe integer)  |
| `00 00`                                  | Frame flags                                |
| `03`                                     | Text encoding: UTF-8                       |
| `SOUNDSWITCH_ID` `00`                    | Description, null-terminated               |
| `{DE61C185-CF6E-4FED-917F-3566DCD988FA}` | Value: the script's file name, with braces |

Found in the copy of the scripted song on the USB drive (`Engine Library/Music/…`), inside the ID3v2.4 tag at the start
of the MP3 (the tag also holds the title, artist and cover art).

**Likely:** this is how the player (and SoundSwitch) match a song to `{UUID}.ssfile`: read the `SOUNDSWITCH_ID` tag,
then load the script with that name. **Confirmed:** `m.db` plays no part in this link (see below).

So, to make a song play lights from Open DMX Stage, the export would:

1. Give the song a `SOUNDSWITCH_ID` `TXXX` frame with a new UUID (or reuse the one it has).
2. Write `{UUID}.ssfile` with the script.
3. Put both, with the venue, where the player looks for them (**not known yet**, see below).

## Engine Library on the USB drive (Engine DJ database 3.0.2)

The drive has a normal Engine DJ library: `Engine Library/Database2/m.db`, `hm.db`, `sm.db` and `stm.db` (SQLite),
`OverviewData/`, `Artwork/` and `Music/` with the song.

- **Confirmed:** `Information` says schema 3.0.2. `Track` has the usual columns (path, title, artist, BPM, length,
  `originDatabaseUuid`…) and `PerformanceData` holds track, waveform, beat, cue and loop data. **No column or table is
  about lighting**, and the script UUID appears in none of the four files.
- **Confirmed:** the databases were written at 13:07, before the song was scripted (14:40), and the scripted song is in
  `Track` (80 BPM, 163 seconds).
- **Open question:** this drive has **no** `Engine Library/SoundSwitch/` folder; the exports sit at the drive's root
  as `.ssproj` folders. Where the SC Live 4 looks for `{UUID}.ssfile` and the venue is not confirmed yet. A drive
  prepared by SoundSwitch's own USB export, then played on the SC Live 4, would show it.

## Auto loops: shows that follow the beat of any song

### Banks (`SoundSwitchAutoLoops.bin`, `SoundSwitchAutoLoopsEx.bin`) (Confirmed)

Header `AA AA 09 55`, version 3, no trailer. Then:

1. The bank names as strings: "Bank 1 : Dynamic", "Bank 2 : Upbeat", "Bank 3 : Smooth", "Bank 4 : Random".
2. The number of loop entries (32 in the first file, 96 in the "Ex" file: 128 in all), then each entry:

   | Size | Meaning                                                                 |
   | ---: | ----------------------------------------------------------------------- |
   |    4 | `2`                                                                     |
   |    4 | Loop number, counting from 0: entry 0 is `SSAutoLoop1.ssfile`           |
   |    4 | `16`: the loop's length in beats (every one of the 128 entries says 16) |
   |  var | String: the loop's name, for example "Dynamic Autoloop 1"               |
   |    4 | The bank, 0 to 3                                                        |

3. For each bank: `8` (or the bank's count), the loop numbers in play order, then a byte `01`.

The first file lists loops 1 to 8 of each bank, the "Ex" file loops 9 to 32: **4 banks × 32 loops = 128 files**. File
numbers do not always follow the names: Upbeat's entries are stored as Upbeat 1, 4, 2, 5, 3, 6, 7, 8 (loop numbers 8
to 15), and its play-order list (8, 10, 12, 9, 11, 13, 14, 15) puts them back in name order. **Likely:** the bank
shows and plays its loops in the play-order list's order.

### Loop files (`SSAutoLoopN.ssfile`)

Same header and block layout as a song's script (see Timed blocks), with one difference:

- **Confirmed: time is in beats, 2,400 units per beat.** Across all 128 exported loops, about 6,100 block start times
  were checked and all but 9 are exact multiples of 2,400; 73 loops end at exactly 38,400 (16 beats × 2,400). A song
  script uses milliseconds; a loop uses beat units, which is what lets it follow any tempo.
- **Confirmed: a block can fade.** In `SSAutoLoop21.ssfile` every block goes from one colour to a different one: purple
  `FF4800FF` → cyan `FF00FFCC` over beats 0–2, cyan → magenta `FFCC00FF` over beats 2–4, and so on.
- **Confirmed:** exporting rebuilds the loops for the chosen venue (they change size when the venue changes), so a
  loop names the fixtures it drives.

So an exporter would write each of our sequences as a loop: one block per step, at 2,400 units per beat, fading from
the step's colour to the next.

## Venue (`SoundSwitchVenues.bin`)

The body starts at 0x2C. Read so far, in order:

| Offset | What                                                                            | Status    |
| -----: | ------------------------------------------------------------------------------- | --------- |
|   0x2C | String: venue name, "Demonstration"                                             | Confirmed |
|   0x50 | `0x0F`, `2`, `1`, `2`: unknown (`2` could be the number of fixtures or zones)   | Guess     |
|   0x60 | `0x80000001`: a numbered record, as in the scripts (the first fixture?)         | Likely    |
|   0x64 | `0`, `0x0E`: unknown                                                            | Guess     |
|   0x6C | String: fixture name, "Intimidator Trio"                                        | Confirmed |
|   0x96 | String: maker, "Chauvet"                                                        | Confirmed |
|   0xAE | `0` (4 bytes)                                                                   | Likely    |
|   0xB2 | 16-byte GUID `{20CD72B7-22AB-4CDA-87E0-0A657FC5240E}`: the fixture profile's id | Likely    |
|   0xFB | First channel block: `2`, then `0x57`, then the string "White Zone 1" at 0x103  | Confirmed |

**Confirmed:** fields here are packed, not aligned to 4 bytes (the first channel's string starts at 0x103).

The channel names in order are White, Red, Green and Blue Zone 1, Cell 1, the same for zones 2 and 3, then Dimmer,
Pan, Tilt, Shutter, Zoom, Built-in Control, Movement Macros, Speed, four "No function", Colors, Built-in Speed and
Control Functions. Further on, "MASTER", "SSON" and "30 Channel Mode" (the fixture's DMX mode) appear.

- **Guess:** each channel block has a type code before its name (`0x57` before "White Zone 1", `0x0E` before
  "Red Zone 1") and its DMX offset and default value after it. Not decoded yet.

### Patched fixtures (from `default export 4.ssproj`)

The latest venue patches four fixtures named "Fixture 1" to "Fixture 4", in records `0x11F` bytes apart (first name at
0x1FDA). Comparing the four records byte by byte:

- **Confirmed:** each fixture has two numbered records, `0x80000001` and `0x80000002` for Fixture 1, `0x80000003` and
  `0x80000004` for Fixture 2, and so on.
- **Confirmed:** a fixture refers to its profile by the profile's GUID. SlimPAR 64 is
  `{DCCC5EE8-A24D-4B32-91D3-8C298DAC49E2}` (at 0x1AC5 in its profile, 7-channel and 3-channel modes) and Intimidator
  Trio `{20CD72B7-22AB-4CDA-87E0-0A657FC5240E}`. Two of the four fixtures use each.
- The DMX start address is in each record; see "A venue with the real rig" below for where.

### A venue with the real rig: `Venue 1-8` and `Venue 1-15` (Confirmed)

Two exports of a venue holding only the two pars, identical except for the second par's address (8, then 15). The
venue file is 12,598 bytes (12,600 for "Venue 1-15", whose name is one character longer).

- **Profile:** one fixture profile, **"RGB Par Light"** by **"U King"**, "Mode 1", 7 channels in this order:
  Intensity, Red, Green, Blue, Strobe, Color Macro, Macro Speed. It also carries "StrobeValues",
  "SetShutterClosed" and "SetShutterStrobe" (how SoundSwitch drives the strobe channel).
- **Patched fixtures:** two records, `0x11F` bytes apart, named "Fixture 1" and "Fixture 2" (in `Venue 1-15`,
  "Fixture 3" and "Fixture 4": the pars were added again).
- **DMX address: a 32-bit number counting from 0**, at **0xE3 bytes after the first character of the fixture's
  name** (0xEB after the start of the name string). `Venue 1-8`: 0 and 7 (addresses 1 and 8). `Venue 1-15`: 0 and 14
  (addresses 1 and 15). Apart from its name and two file positions shifted by the longer venue name, the address is the only field that changes in the second par's record.
- **The venue gets a new GUID on every export**, written in the header (0x1C) and in three more places.
- **The venue stores absolute file positions.** With the name one character longer, a dozen 32-bit values further on
  are exactly 2 higher. A writer must compute these positions as it lays the file out. Not mapped yet: which values
  they are.
- **Auto loops do not depend on the addresses.** All 128 loop files are byte-for-byte the same in both exports, so a
  loop names fixtures (by id), and the venue says where each one is patched.
- Positions ("Disco Ball", "Stage Left"…), "Custom Cue 1" to "7" and a numbered table (10 to 128) are present even in
  this two-par venue: they are SoundSwitch's defaults.

### Changes between saves

**Confirmed:** between exports, the venue file changes only in two 64-bit numbers, repeated in each of its four large
records (at 0x2050 and 0x2058, then every 0x11F bytes). For example `0x0AFF08CBB8` / `0x016F7149E0` in the first
export, then `0x083F17CA38` / `0x016F4FC9E0`, and `0x016F4FCA90` in the transition export (176 higher). They are not
Unix times. **Guess:** a save counter or a position, not content.

## Not looked at yet

- The rest of the venue layout: channel types, DMX addresses, value ranges.
- The auto-loop bank files and `recordable/*.dat`.
- Where the player looks for scripts and the venue on a USB drive.

## What would make this much faster

Controlled pairs of exports that differ in one thing only, so a byte diff points at the field:

1. The same one-block track with the block **red**, then **blue** (colour encoding).
2. The same block **moved** by a known time (time encoding).
3. A venue with **one 7-channel par at address 1**, then the same par at **address 8** (patch encoding).
4. The **USB export** of a project (to see `m.db` and the files Engine OS actually reads).
