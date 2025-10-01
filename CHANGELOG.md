# Changelog

## Unreleased

- Remove development debug logging from configuration UI.
- Removed automatic one-time migration for `actorTrackMap` (now opt-out by removing code).
- Removed hidden setting `actorTrackMapMigrated`.
- Tidy up comments and minimize console output during normal operation.
 - Note: an opt-in migration can be added if you want to convert legacy name-based values to paths.
