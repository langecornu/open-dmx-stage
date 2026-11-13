# Security policy

## Supported versions

Only the latest release receives security fixes while the project is below 1.0.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Use GitHub's private reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Include
what you found, how to reproduce it, and the version or commit. You will get an acknowledgement, and a fix or an
explanation, as soon as the maintainer can manage; this is a small open source project.

## Scope and design notes

Open DMX Stage controls physical lighting equipment and has **no login**. It is meant for your own machine or a trusted
local network. By default the server listens on every network address (`0.0.0.0`), so anyone on the same network can
control the lights and start AI shows billed to a saved Anthropic key. On a network you do not trust, set
`HOST=127.0.0.1` to keep it on this computer. Do not expose it to the internet. The https address uses a self-signed
certificate (ADR 0009): it encrypts the connection, and its fingerprint, shown in Settings, lets you check you are
talking to this app.

What the server does to limit risk: validates all input with strict schemas and size limits, restricts the network
output destination to local-network addresses, only opens serial ports the operating system lists, checks the browser
origin on the control socket, sets security headers, and rate limits the API.
