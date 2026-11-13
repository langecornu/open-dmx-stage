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

## Threat model

| Who                                          | What they could do                                                                                   | What limits it                                                                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anyone on the same network                   | Everything the app does: run the lights, change or replace the show, start AI shows on the saved key | The network itself (use one you trust, or `HOST=127.0.0.1`). The key is write-only. AI shows are rate limited and made one at a time. Shows are kept in the list before replacement. |
| A web page open in a browser on that network | Send requests to the app from the browser (cross-site requests), or read it through DNS rebinding    | Changes are only accepted from the app's own pages (Origin and Sec-Fetch-Site checks), requests must be addressed to this computer (Host check), CORS, and the socket's origin check |
| Anyone on the network, through the decks     | List and play the audio files in the chosen music folder, and change the folder                      | Only audio files inside the folder are listed or read, by id from the server's own list; links out of the folder are not followed; the scan is bounded                               |
| A crafted file (show, venue, fixture, QLC+)  | Break the app or the show                                                                            | Strict schemas with size limits, no XML entity expansion, imported data is never run                                                                                                 |
| A client flooding the control socket         | Starve the output                                                                                    | Message size limit, a per-client message budget, a cap on connections, heartbeats                                                                                                    |

What the server does to limit risk: validates all input with strict schemas and size limits, restricts the network
output destination to local-network addresses, only opens serial ports the operating system lists, refuses requests
from other sites' pages and requests addressed to other names, checks the browser origin on the control socket and
limits each client's messages, sets security headers, and rate limits the API. The https private key and the saved
Anthropic key are readable by their owner only and never committed (`server/data/` is git-ignored).
