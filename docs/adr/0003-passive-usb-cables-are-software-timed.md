# 3. Passive USB-DMX cables are timed in software and marked experimental

Status: accepted

## Context

Passive "Open DMX" style cables (for example the DSD TECH SH-RS09B) contain a USB-serial chip and a line driver and no
processor, so the computer must produce the break and the timing. Node.js timers are not real-time.

## Decision

Support them with a driver that uses a long break (about 1 ms, within the DMX specification, so tolerant of timer jitter)
and continuous refresh, but document them as experimental and untested on real hardware until verified. Prefer active
adapters and network interfaces in the documentation for shows. `npm run dmx:ramp` exists so anyone can verify a cable.

## Update: first verification on real hardware (2026-11-10)

A DSD TECH SH-RS09B (FTDI FT232R, USB 0403:6001) on a Mac (macOS 26, Apple silicon, Node 24) drove two LED par lights
with steady colours, brightness and no flicker, using this driver as it is. The serial port was confirmed at 250000 baud,
8 data bits, no parity, 2 stop bits. A different way of making the break (a slow zero byte at 90909 baud, then 250000 baud
for the data) was tried and made no difference, so the long serial break stays. **Detect adapter** reported a passive
cable, as expected. The flicker seen during the session came from lights set to the wrong addresses, not from the
timing. Still not verified: other computers and operating systems, long or busy sessions, and active adapters.

## Consequences

Cheap cables work in the common case but may flicker on a busy computer. The documentation must not claim support that
has not been verified.
