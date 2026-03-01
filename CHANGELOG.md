# Changelog

## [Unreleased]

### Added
- All sound effects now play for all connected players (previously GM-only)
- Combat end dialog now displays for all players (previously GM-only)
- Enhanced error logging to help diagnose missing or invalid playlists

### Fixed
- Fixed permission errors when GMs trigger playlist sounds
- Fixed hype tracks not checking GM permissions before playing
- Improved sound path validation

### Changed
- Only the GM client now triggers `playSound()` calls to prevent permission errors on player clients
- Sound state is automatically broadcast to all players by Foundry
- Code cleanup: removed unused functions and settings
- Simplified and modernized Dialog implementation
