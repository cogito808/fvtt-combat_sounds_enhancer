# fvtt-combat_sounds_enhancer
Add sounds to various elements of combat.

Important: this version targets Foundry V13.

This module is a lightweight no-build module that plays playlist sounds on combat events. It's tested with PF2E.

Quick setup
- Create a "Combat Starts" playlist to play a random track when combat begins.
- Create a "Hype Tracks" playlist for player-assigned characters; these tracks play at the start of each turn.
- Create a "Death Sounds" playlist for NPC defeat events.
- Create a "Critical Success" and "Critical Failure" playlists for matching critical outcomes in PF2E.
- Create a "Hero Points" playlist to play a sound when a hero point is used (PF2E).

Testing the Playlist Name Mapping UI (GM only)
1. In Foundry, open Settings -> Manage Modules -> fvtt-combat_sounds_enhancer and click the small gear/menu entry labelled "Edit playlist name mapping" (GM only).
2. The form shows human-friendly labels (e.g., "Combat Start") and allows you to override the exact playlist names the module looks up.
3. Save the form to persist overrides to the world settings. The module uses these values when resolving playlist names.