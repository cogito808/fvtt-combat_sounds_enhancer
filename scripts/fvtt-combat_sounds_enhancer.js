// Combat Sounds Enhancer Module

let isMonkCombatDetailsActive = false;
let combatStartLock = Promise.resolve();

// Default playlist name mapping. Use `getPlaylistByKey(key)` to look up playlists
// so playlist names can be changed centrally or via a setting in the future.
const DEFAULT_PLAYLIST_NAMES = {
  combatStart: "Combat Starts",
  combatEnd: "Combat End",
  hypeTracks: "Hype Tracks",
  deathSounds: "Death Sounds",
  criticalSuccess: "Critical Success",
  criticalFailure: "Critical Failure",
  heroPoints: "Hero Points"
};

// Human-friendly labels for the form UI (first word capitalized, space-separated)
const PLAYLIST_LABELS = {
  combatStart: "Combat Start",
  combatEnd: "Combat End",
  hypeTracks: "Hype Tracks",
  deathSounds: "Death Sounds",
  criticalSuccess: "Critical Success",
  criticalFailure: "Critical Failure",
  heroPoints: "Hero Points"
};

/**
 * Return a Playlist by logical key (e.g. 'combatStart', 'hypeTracks').
 * Uses `game.settings` override if present; otherwise falls back to defaults.
 */
function getPlaylistByKey(key) {
  const overrides = game?.settings?.get?.("fvtt-combat_sounds_enhancer", "playlistNameMap") || {};
  const names = foundry.utils.mergeObject(foundry.utils.mergeObject({}, DEFAULT_PLAYLIST_NAMES), overrides);
  const name = names[key];
  if (!name) return null;
  return game.playlists.getName(name) || null;
}

function getRandomValidSoundFromPlaylist(playlist) {
  if (!playlist) {
    console.warn("fvtt-combat_sounds_enhancer: Playlist not found");
    return null;
  }
  if (!playlist.sounds || playlist.sounds.length === 0) {
    console.warn(`fvtt-combat_sounds_enhancer: Playlist "${playlist.name}" has no sounds`);
    return null;
  }
  const validSounds = playlist.sounds.filter(s => s.path && typeof s.path === 'string' && s.path.trim().length > 0);
  if (validSounds.length === 0) {
    console.warn(`fvtt-combat_sounds_enhancer: Playlist "${playlist.name}" has sounds but none have valid paths`);
    return null;
  }
  return validSounds[Math.floor(Math.random() * validSounds.length)];
}

// Require the V2 FormApplication API for future-proofing. If missing, fail early in init.
// Provide a runtime alias so classes can be defined even when V2 is not present;
// the init-time check will still notify and throw if V2 is required.
const FormAppBase = foundry?.applications?.api?.FormApplicationV2 ?? FormApplication;

Hooks.once("ready", () => {
  isMonkCombatDetailsActive = game.modules.get("monks-combat-details")?.active;
});
Hooks.once("init", async () => {
  // Use the namespaced loadTemplates when available (newer Foundry); fall back
  // to the global `loadTemplates` for V13 compatibility.
  const loadTemplatesFn = foundry?.applications?.handlebars?.loadTemplates ?? loadTemplates;
  await loadTemplatesFn([
  "modules/fvtt-combat_sounds_enhancer/templates/playlist-name-config.html",
  "modules/fvtt-combat_sounds_enhancer/templates/hype-track-config.html"
  ]);

  // Register custom data field for hype track on token prototypes
  if (foundry?.data?.fields) {
    const fields = foundry.data.fields;
    
    // Extend Actor schema to add hypeTrack field
    Hooks.on("modelDataFieldRegister", (fields) => {
      if (CONFIG.Actor.dataFields) {
        CONFIG.Actor.dataFields.prototype.hypeTrack = new fields.StringField({ 
          initial: "",
          label: "Hype Track",
          hint: "Path to hype track sound for this actor"
        });
      }
    });
  }

  game.settings.register("fvtt-combat_sounds_enhancer", "enableHypeTracks", {
    name: "Enable Hype Tracks",
    hint: "Play hype track for each actor on their turn.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    order: 1
  });

  game.settings.register("fvtt-combat_sounds_enhancer", "enableCombatStarts", {
    name: "Enable Combat Starts",
    hint: "Play sound when combat starts.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    order: 2
  });

  game.settings.register("fvtt-combat_sounds_enhancer", "enableDeathSounds", {
    name: "Enable Death Sounds",
    hint: "Play sound when non-character actor is defeated.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    order: 3
  });

  game.settings.register("fvtt-combat_sounds_enhancer", "enableCriticalSounds", {
    name: "Enable Critical Sounds",
    hint: "Play sound on critical success or failure.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    order: 4
  });

  game.settings.register("fvtt-combat_sounds_enhancer", "enableHeroPointSounds", {
    name: "Enable Hero Point Sounds",
    hint: "Play sound when a hero point is used.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    order: 5
  });

  game.settings.register("fvtt-combat_sounds_enhancer", "enableCombatEndDialog", {
    name: "Enable Combat End Dialog",
    hint: "Show a dialog with a message when combat ends.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    order: 6
  });

  game.settings.register("fvtt-combat_sounds_enhancer", "combatEndDialogText", {
    name: "Combat End Message",
    hint: "The text to display in the dialog when combat ends.",
    scope: "world",
    config: true,
    type: String,
    default: "Combat has ended!",
    order: 7
  });

  // Allow overriding playlist names without changing code
  game.settings.register("fvtt-combat_sounds_enhancer", "playlistNameMap", {
    name: "Playlist Name Map",
    scope: "world",
    config: false,
    type: Object,
    default: DEFAULT_PLAYLIST_NAMES
  });

  // Register a small config form to edit playlist name overrides
  game.settings.registerMenu("fvtt-combat_sounds_enhancer", "playlistNameConfig", {
    name: "Playlist Name Mapping",
    label: "Edit playlist name mapping",
    hint: "Override playlist names used by the module (GM only).",
    icon: "fas fa-list-music",
    type: PlaylistNameMapForm,
    restricted: true,
    order: 100
  });
   
// Register a new settings menu item for hype track assignments
  game.settings.registerMenu("fvtt-combat_sounds_enhancer", "hypeTrackConfig", {
    name: "Hype Track Assignments",
    label: "Assign Hype Tracks to Player Characters",
    hint: "Select a hype track sound for each player character.",
    icon: "fas fa-volume-up",
    type: HypeTrackConfigForm,
    restricted: true,
    order: 200
  });    

class PlaylistNameMapForm extends FormAppBase {
  static get defaultOptions() {
  return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Playlist Name Mapping",
      id: "playlist-name-map",
      template: "modules/fvtt-combat_sounds_enhancer/templates/playlist-name-config.html",
      width: 600
    });
  }

  getData() {
    const map = game.settings.get("fvtt-combat_sounds_enhancer", "playlistNameMap") || {};
    const keys = Object.keys(DEFAULT_PLAYLIST_NAMES).sort();
    const labels = PLAYLIST_LABELS;
    // Available playlist names in the world, sorted alphabetically
    const playlists = (game.playlists?.contents?.map(p => p.name) || []).sort();
    // Merged current mapping (defaults overridden by saved map) used for selection
    const current = foundry.utils.mergeObject(foundry.utils.mergeObject({}, DEFAULT_PLAYLIST_NAMES), map);
    return { map, defaults: DEFAULT_PLAYLIST_NAMES, keys, labels, playlists, current };
  }

  async _updateObject(event, formData) {
    // formData will contain keys matching DEFAULT_PLAYLIST_NAMES
    const newMap = {};
    for (const k of Object.keys(DEFAULT_PLAYLIST_NAMES)) {
      const v = formData[k];
      // if empty string, user chose default -> do not set override
      if (v && String(v).trim().length > 0) newMap[k] = String(v).trim();
    }
    await game.settings.set("fvtt-combat_sounds_enhancer", "playlistNameMap", foundry.utils.mergeObject(foundry.utils.mergeObject({}, DEFAULT_PLAYLIST_NAMES), newMap));
  }
}

Handlebars.registerHelper("ifEquals", function(a, b, options) {
  return a === b ? options.fn(this) : options.inverse(this);
});

/**
 * Helper: detect whether a context represents damage (to avoid duplicate sounds).
 * Works with PF2E and SF2E systems.
 */
function isDamageContext(context) {
  if (!context || typeof context !== 'object') return false;
  if (context.roll && context.roll.type === 'damage') return true;
  if (Array.isArray(context.roll?.types) && context.roll.types.includes('damage')) return true;
  if (String(context.type).toLowerCase().includes('damage')) return true;
  return false;
}

Hooks.on("combatStart", (combat, options, userId) => {
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableCombatStarts")) return;
  if (!game.user.isGM) return;

  const delay = isMonkCombatDetailsActive ? 500 : 0;

  combatStartLock = (async () => {
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));

    const playlist = getPlaylistByKey('combatStart');
    const sound = getRandomValidSoundFromPlaylist(playlist);
    if (!sound || !playlist) return;

    await playlist.playSound(sound);

    while (sound.playing) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  })();
});

Hooks.on("updateCombat", async (combat, updateData) => {
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableHypeTracks")) return;
  if (!game.user.isGM) return;
  if (!("turn" in updateData)) return;

  const actor = combat.combatant?.actor;
  if (!actor || actor.type !== "character") return;

  const assignments = game.settings.get("fvtt-combat_sounds_enhancer", "pcHypeTracks") || {};
  const hypeTrackPath = assignments[actor.id];
  if (!hypeTrackPath) return;

  const playlist = getPlaylistByKey("hypeTracks");
  const sound = playlist?.sounds.find(s => s.path === hypeTrackPath);
  if (!sound) return;

  await combatStartLock;
  await playlist.playSound(sound);
});

Hooks.on("updateCombatant", async (combatant, updateData) => {
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableDeathSounds")) return;
  if (!updateData.defeated) return;
  if (!game.user.isGM) return;

  const actor = combatant.actor;
  if (!actor || actor.type === "character") return;

  const playlist = getPlaylistByKey('deathSounds');
  const sound = getRandomValidSoundFromPlaylist(playlist);
  if (!sound || !playlist) return;

  await playlist.playSound(sound);
});

Hooks.on("preCreateChatMessage", async (message, options, userId) => {
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableCriticalSounds")) return;
  if (!game.user.isGM) return;
  // Support both PF2E (pf2e) and SF2E (sf2e) systems
  const flags = message.flags?.pf2e?.context || message.flags?.sf2e?.context;
  if (!flags) return;

  // If this message explicitly marks a critical, play the critical sound
  // (allow skill checks and non-attack criticals). Exclude damage rolls.
  const isCriticalSuccess = !!flags.isCriticalSuccess;
  const isCriticalFailure = !!flags.isCriticalFailure;
  if (!isCriticalSuccess && !isCriticalFailure) return;
  if (isDamageContext(flags)) return;

  // Use the same logical keys as the createChatMessage handler
  const playlistKey = isCriticalSuccess ? 'criticalSuccess' : 'criticalFailure';
  const playlist = getPlaylistByKey(playlistKey);
  const sound = getRandomValidSoundFromPlaylist(playlist);
  if (!sound || !playlist) return;

  await playlist.playSound(sound);
});

Hooks.on("createChatMessage", async (message) => {
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableCriticalSounds")) return;
  if (!game.user.isGM) return;
  // Support both PF2E (pf2e) and SF2E (sf2e) systems
  const context = message.flags?.pf2e?.context || message.flags?.sf2e?.context;
  const outcome = context?.outcome;
  const unadjustedOutcome = context?.unadjustedOutcome;

  const criticalOutcome = outcome || unadjustedOutcome;
  if (!criticalOutcome) return;
  if (!["criticalSuccess", "criticalFailure"].includes(criticalOutcome)) return;
  if (isDamageContext(context)) return;

  const playlistKey = criticalOutcome === 'criticalSuccess' ? 'criticalSuccess' : 'criticalFailure';
  const playlist = getPlaylistByKey(playlistKey);
  const sound = getRandomValidSoundFromPlaylist(playlist);
  if (!sound || !playlist) return;

  await playlist.playSound(sound);
});

// Track previous hero points state for hero point usage detection
const previousHeroPointCounts = new WeakMap();

Hooks.on("updateActor", async (actor, updateData, options, userId) => {
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableHeroPointSounds")) return;
  if (!game.user.isGM) return;
  // Hero points are PF2E-only
  if (game.system.id !== "pf2e") return;

  // Hero points are in actor.system.resources.heroPoints as {value: X, max: Y}
  const heroPointData = actor.system?.resources?.heroPoints;
  const currentHeroPoints = heroPointData?.value ?? 0;
  const previousHeroPoints = previousHeroPointCounts.get(actor) ?? currentHeroPoints;

  // Check if hero points were used (decreased)
  if (currentHeroPoints < previousHeroPoints) {
    const playlist = getPlaylistByKey('heroPoints');
    const sound = getRandomValidSoundFromPlaylist(playlist);
    if (sound && playlist) {
      await playlist.playSound(sound);
    } else {
      console.warn("fvtt-combat_sounds_enhancer: No valid sound found for hero points");
    }
  }

  // Update the tracked hero point count for this actor
  previousHeroPointCounts.set(actor, currentHeroPoints);
});

Hooks.on("deleteCombat", async (combat, options, userId) => {
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableCombatEndDialog")) return;

  const dialogText = game.settings.get("fvtt-combat_sounds_enhancer", "combatEndDialogText");
  
  // Play the combat end sound (GM only)
  if (game.user.isGM) {
    const playlist = getPlaylistByKey('combatEnd');
    const sound = getRandomValidSoundFromPlaylist(playlist);
    if (sound && playlist) {
      await playlist.playSound(sound);
    }
  }

  // Show the dialog for all users
  new Dialog({
    title: "Combat Ended",
    content: `<p>${dialogText}</p>`,
    buttons: {
      close: {
        icon: '<i class="fas fa-check"></i>',
        label: "Close",
        callback: () => {}
      }
    },
    default: "close"
  }).render(true);
});