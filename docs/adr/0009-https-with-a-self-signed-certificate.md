# 9. The app also serves https, with a certificate it makes itself

Status: accepted

## Context

Since ADR 0008 the app is reachable from phones and tablets at this computer's network address over plain http.
Browsers only give the microphone (Follow the music) and Web MIDI to secure pages: https, or a page on its own computer
(localhost). So on a phone those features could not work. A certificate that every device trusts needs a public domain
name or software installed on each device; the app must also work at a venue with no internet.

## Decision

- Besides http on `PORT`, the server listens over https on `HTTPS_PORT` (4443 by default; `0` turns it off), serving
  the same app and live link.
- It uses a self-signed certificate it makes on first start (`selfsigned`, MIT), kept in `<DATA_DIR>/tls/` with the key
  readable by its owner only. The certificate covers localhost and this computer's current names and IPv4 addresses,
  lasts 397 days, uses an EC P-256 key with SHA-256 and is marked for server authentication, as Apple devices require.
  A new one is made when an address it does not cover appears or when it has less than 30 days left.
- Each device shows a "not private" warning once; the person checks the SHA-256 fingerprint shown in Settings and
  accepts. Settings lists the https addresses.
- Pages opened at the https addresses are trusted for the API and the live link, like the http ones.
- If the certificate cannot be made or the port is busy, the app runs over http only and logs why.

## Consequences

The microphone works on phones and tablets after the one-time warning; MIDI too where the browser supports it (not Safari
on iPhone or iPad). The warning is a familiar but real hurdle, and some browsers forget the exception after a while. A
certificate authority installed once per device, a public domain with Let's Encrypt, or Tailscale would remove it; they
were set aside for now as needing more setup on every device or an internet connection.
