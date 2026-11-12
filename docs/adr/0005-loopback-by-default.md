# 5. The server listens on loopback by default

Status: superseded by ADR 0008

## Context

The control surface has no login and can change lighting output and the network destination. Listening on all
interfaces by default exposes it to everyone on the network.

## Decision

The server binds to `127.0.0.1` unless `HOST` is set (for example `HOST=0.0.0.0` to use a phone or tablet on the same
network). Documentation says to do this only on a trusted network.

## Consequences

Safe by default. Controlling the show from another device needs one explicit setting. An optional access token is a
possible future addition and would be recorded in a new decision.
