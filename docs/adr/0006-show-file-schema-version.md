# 6. The show file carries a schema version and migrations

Status: accepted

## Context

Users' saved shows must keep working when the file format changes. Without a version, a format change silently breaks
saved work.

## Decision

The project file has a `schemaVersion`. Loading runs it through ordered migrations before validation, so older files are
upgraded in memory. Saving keeps a rolling backup of the previous file, and the app can export and import a show file.

## Consequences

Every format change needs a migration and a test that loads an old file. Backups and export give users a way back.
