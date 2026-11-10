# 4. One universe, one output at a time

Status: accepted

## Context

Most small rigs fit in 512 channels, and supporting several universes and outputs multiplies the model, the interface
and the failure modes.

## Decision

The app sends a single universe (512 channels) to one output at a time. Switching output blanks and releases the old
one before the new one is used, and rolls back if the new one cannot be opened.

## Consequences

Simple and predictable. Larger rigs are out of scope until a decision to support multiple universes supersedes this one.
