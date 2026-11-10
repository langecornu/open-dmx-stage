# 3. Passive USB-DMX cables are timed in software and marked experimental

Status: accepted

## Context

Passive "Open DMX" style cables (for example the DSD TECH SH-RS09B) contain a USB-serial chip and a line driver and no
processor, so the computer must produce the break and the timing. Node.js timers are not real-time.

## Decision

Support them with a driver that uses a long break (about 1 ms, within the DMX specification, so tolerant of timer jitter)
and continuous refresh, but document them as experimental and untested on real hardware until verified. Prefer active
adapters and network interfaces in the documentation for shows. `npm run dmx:ramp` exists so anyone can verify a cable.

## Consequences

Cheap cables work in the common case but may flicker on a busy computer. The documentation must not claim support that
has not been verified.
