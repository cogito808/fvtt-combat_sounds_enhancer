# fvtt-combat_sounds_enhancer
Add sounds to various elements of combat.

Important: this version targets Foundry V13+ and will remain compatible with V13. The module uses newer APIs when available but falls back to maintain compatibility.

This module is a lightweight no-build module that plays playlist sounds on combat events. It's tested with PF2E; please report issues if you use other systems.

Quick setup
- Create a "Combat Starts" playlist to play a random track when combat begins.
- Create a "Hype Tracks" playlist for player-assigned characters; these tracks play at the start of each turn.
- Create a "Death Sounds" playlist for NPC defeat events.
- Create a "Critical Success" and "Critical Failure" playlists for matching critical outcomes in PF2E.

Testing the Playlist Name Mapping UI (GM only)
1. In Foundry, open Settings -> Manage Modules -> fvtt-combat_sounds_enhancer and click the small gear/menu entry labelled "Edit playlist name mapping" (GM only).
2. The form shows human-friendly labels (e.g., "Combat Start") and allows you to override the exact playlist names the module looks up.
3. Save the form to persist overrides to the world settings. The module uses these values when resolving playlist names.

Developer notes
- No build step: edit files in place and refresh the client (Developer -> Reload Module).
- Playlist names are authoritative; use the Playlist Name Mapping UI to change names per world.

If something looks off, open an issue or submit a PR — small, focused changes are welcome.
