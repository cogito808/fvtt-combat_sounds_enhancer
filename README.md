# fvtt-combat_sounds_enhancer
Add sounds to various elements of combat.
Important: this version targets Foundry V13.

Designed to play playlist sounds on combat events. It's tested with PF2E, but mostly works with D&D.

Quick setup
- Create a "Combat End" playlist for the end-of-combat dialog sound.
- Create a "Combat Starts" playlist to play a random track when combat begins.
- Create a "Critical Failure" playlists for matching critical outcomes in PF2E.
- Create a "Critical Success" playlists for matching critical outcomes in PF2E.
- Create a "Death Sounds" playlist for NPC defeat events.
- Create a "Hype Tracks" playlist for characters tracks that play at the start of each turn. 
- Create a "Hero Points" playlist to play a sound when a hero point is used (PF2E).

Testing the Playlist Name Mapping UI (GM only)
1. In Foundry, open Settings -> Manage Modules -> fvtt-combat_sounds_enhancer and click the small gear/menu entry labelled "Edit playlist name mapping" (GM only).
2. The form allows overable toggles for all features.
3. The form shows human-friendly labels (e.g., "Combat Start") and allows you to override the exact playlist names the module looks up.
4. Customizable Combat End Message tied to playlist with close button to dismiss.
4. Save the form to persist overrides to the world settings. The module uses these values when resolving playlist names.