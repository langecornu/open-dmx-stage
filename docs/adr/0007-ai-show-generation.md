# 7. AI show generation calls the Anthropic API from the server, with a write-only key

Status: accepted

## Context

People want looks and sequences designed for them, for their own rig and optionally a song, steering only what they care
about. A large language model can design these if it knows what every light can do. Doing it needs an API key that
costs the owner money, a description of the rig, and some knowledge of the song.

## Decision

- **Claude through the official Anthropic SDK, on the server only.** The browser never talks to Anthropic and never sees
  the key. The model is `claude-opus-5-5` with medium effort, streamed, with server-side refusal fallbacks
  (`fallbacks: "default"`).
- **A write-only key.** It is pasted once on Settings, checked with Anthropic, and stored in `server/data/secrets.json`
  with permissions for the owner only (the data folder's JSON files are git-ignored). No route returns it; the page only
  learns whether a key is saved. `ANTHROPIC_API_KEY` in the environment takes precedence.
- **Only numbers about the song.** The audio is analysed in the browser (tempo, first downbeat, energy per section); only
  those numbers are sent. The rig description (light names, fixture types, controls and their options) and the person's
  choices are sent with them. Nothing else from the show is.
- **The answer is data, never trusted as a show.** Structured outputs fix the answer's shape; `shared/aiShow.js` then
  keeps only known lights, controls and options, clamps every number, and builds looks and sequences on this rig's
  channels, which must still pass the show schema when saved.
- **Rate limited** to six generations a minute, as each one spends money.

## Consequences

AI shows need an internet connection and an Anthropic account; everything else keeps working without them. Anyone who
can reach the app can start a generation billed to the saved key, so the loopback default (ADR 0005) matters more: on a
network that is not trusted, keep `HOST` at `127.0.0.1`. An access token for the app would remove this concern and
would be recorded in a new decision.
