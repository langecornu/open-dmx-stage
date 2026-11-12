# 8. The server listens on the network by default

Status: accepted (supersedes ADR 0005)

## Context

ADR 0005 kept the server on `127.0.0.1` unless `HOST` was set. In practice the app runs on a computer by the decks while
the show is run from a phone or tablet, and AI shows are started from any device on the same network. Needing an extra
setting every time got in the way, and the live link refused pages opened from the computer's network address unless
that address was also listed in `ALLOWED_ORIGINS`.

## Decision

- `HOST` defaults to `0.0.0.0`, so the app is reachable from every device on the same network.
- The browser pages trusted for the API and the live link include this computer's own network addresses (IPv4) and
  its name (`name` and `name.local`) on `PORT`, besides `localhost`. They are added only when the server listens beyond
  this computer. Other machines' pages still need to be listed in `ALLOWED_ORIGINS`.
- The server logs a warning at start when it listens beyond this computer.
- `HOST=127.0.0.1` keeps everything on this computer, as before.

## Consequences

Anyone on the same network can control the lights and start AI shows billed to the saved Anthropic key, as the control
surface still has no login. The docs say to use a network you trust, to set `HOST=127.0.0.1` otherwise, and never to
expose the app to the internet. An optional access token remains the way to remove this risk and would be recorded in
a new decision.
