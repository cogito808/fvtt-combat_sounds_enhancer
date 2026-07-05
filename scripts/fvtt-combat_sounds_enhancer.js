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

// Backward-compatible key aliases used by older data shapes.
const LEGACY_PLAYLIST_KEYS = {
  hypeTracks: "hypeTrack"
};

/**
 * Normalize playlist map values to trimmed strings and migrate known legacy keys.
 */
function normalizePlaylistNameMap(map) {
  const normalized = {};
  if (!map || typeof map !== "object") return normalized;

  for (const [rawKey, rawValue] of Object.entries(map)) {
    const key = rawKey === "hypeTrack" ? "hypeTracks" : rawKey;
    let value = null;

    if (typeof rawValue === "string") {
      value = rawValue.trim();
    } else if (rawValue && typeof rawValue === "object") {
      // Support legacy object-shaped values such as {name: "..."}.
      if (typeof rawValue.name === "string") value = rawValue.name.trim();
      else if (typeof rawValue.id === "string") value = rawValue.id.trim();
    }

    if (value) normalized[key] = value;
  }

  return normalized;
}

/**
 * Return a Playlist by logical key (e.g. 'combatStart', 'hypeTracks').
 * Uses `game.settings` override if present; otherwise falls back to defaults.
 */
function getPlaylistByKey(key) {
  const storedMap = game?.settings?.get?.("fvtt-combat_sounds_enhancer", "playlistNameMap") || {};
  const overrides = normalizePlaylistNameMap(storedMap);
  const names = foundry.utils.mergeObject(foundry.utils.mergeObject({}, DEFAULT_PLAYLIST_NAMES), overrides);
  const configuredNameOrId = names[key] ?? names[LEGACY_PLAYLIST_KEYS[key]];
  if (!configuredNameOrId) return null;

  const playlists = game.playlists;
  if (!playlists) return null;

  let playlist = null;
  // Accept direct playlist IDs in addition to names.
  if (typeof playlists.get === "function") {
    playlist = playlists.get(configuredNameOrId);
  }
  if (typeof playlists.getName === "function") {
    playlist = playlist || playlists.getName(configuredNameOrId);
  }
  if (!playlist && typeof playlists.find === "function") {
    playlist = playlists.find(p => p.name === configuredNameOrId);
  }
  if (!playlist && Array.isArray(playlists.contents)) {
    playlist = playlists.contents.find(p => p.name === configuredNameOrId);
  }

  // Fallback: case-insensitive and trimmed name matching.
  if (!playlist && typeof configuredNameOrId === "string") {
    const target = configuredNameOrId.trim().toLowerCase();
    const all = Array.isArray(playlists.contents) ? playlists.contents : [];
    playlist = all.find(p => String(p?.name || "").trim().toLowerCase() === target) || null;
  }

  return playlist || null;
}

function getPlaylistSounds(playlist) {
  if (!playlist) return [];

  const soundsCollection = playlist.sounds;
  if (Array.isArray(soundsCollection)) return soundsCollection;
  if (Array.isArray(soundsCollection?.contents)) return soundsCollection.contents;
  if (typeof soundsCollection?.toObject === "function") {
    const objectSounds = soundsCollection.toObject();
    if (Array.isArray(objectSounds)) return objectSounds;
  }
  if (typeof soundsCollection?.values === "function") return Array.from(soundsCollection.values());
  if (typeof soundsCollection?.[Symbol.iterator] === "function") return Array.from(soundsCollection);

  // Some Foundry versions expose playback order IDs rather than directly iterable docs.
  if (Array.isArray(playlist.playbackOrder) && typeof soundsCollection?.get === "function") {
    const ordered = playlist.playbackOrder.map(id => soundsCollection.get(id)).filter(Boolean);
    if (ordered.length > 0) return ordered;
  }

  const source = typeof playlist.toObject === "function" ? playlist.toObject() : playlist._source;
  if (source && Array.isArray(source.sounds)) return source.sounds;
  return [];
}

function getSoundReference(sound) {
  if (!sound) return "";

  const fromDirect = [
    sound.path,
    sound.file,
    sound.src,
    sound.sound?.path,
    sound.sound?.src,
    sound._id,
    sound.id,
    sound.uuid
  ];
  for (const candidate of fromDirect) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }

  const source = typeof sound.toObject === "function" ? sound.toObject() : sound._source;
  if (source && typeof source === "object") {
    const fromSource = [
      source.path,
      source.file,
      source.src,
      source.sound?.path,
      source.sound?.src,
      source._id,
      source.id,
      source.uuid
    ];
    for (const candidate of fromSource) {
      if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
    }
  }
  return "";
}

function getSoundId(sound) {
  if (!sound) return "";
  const direct = [sound.id, sound._id];
  for (const candidate of direct) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  const source = typeof sound.toObject === "function" ? sound.toObject() : sound._source;
  if (source && typeof source === "object") {
    const fromSource = [source.id, source._id];
    for (const candidate of fromSource) {
      if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
    }
  }
  return "";
}

function getSoundDisplayName(sound) {
  if (sound?.name && String(sound.name).trim().length > 0) return String(sound.name).trim();
  const reference = getSoundReference(sound);
  return reference || "Unnamed Sound";
}

function buildPlaylistNameMapFromSubmission(formData, event) {
  const submitted = {};

  // Primary source: Foundry-provided flattened/expanded form data object.
  if (formData && typeof formData === "object") {
    const expanded = typeof foundry?.utils?.expandObject === "function" ? foundry.utils.expandObject(formData) : formData;
    for (const k of Object.keys(DEFAULT_PLAYLIST_NAMES)) {
      if (expanded[k] != null) submitted[k] = String(expanded[k]);
    }
  }

  // Fallback source: read directly from submitted form elements.
  if (Object.keys(submitted).length === 0 && event?.currentTarget?.elements) {
    for (const k of Object.keys(DEFAULT_PLAYLIST_NAMES)) {
      const el = event.currentTarget.elements[k];
      if (el && typeof el.value === "string") submitted[k] = el.value;
    }
  }

  const newMap = {};
  for (const k of Object.keys(DEFAULT_PLAYLIST_NAMES)) {
    const v = submitted[k];
    if (v && String(v).trim().length > 0) newMap[k] = String(v).trim();
  }
  return normalizePlaylistNameMap(newMap);
}

function getRandomValidSoundFromPlaylist(playlist) {
  if (!playlist) {
    console.warn("fvtt-combat_sounds_enhancer: Playlist not found");
    return null;
  }
  const sounds = getPlaylistSounds(playlist);
  if (sounds.length === 0) {
    console.warn(`fvtt-combat_sounds_enhancer: Playlist "${playlist.name}" has no sounds`);
    return null;
  }
  const validSounds = sounds.filter(s => getSoundReference(s).length > 0);
  if (validSounds.length === 0) {
    console.warn(`fvtt-combat_sounds_enhancer: Playlist "${playlist.name}" has sounds but none have valid playable references`);
    return null;
  }
  return validSounds[Math.floor(Math.random() * validSounds.length)];
}

// Require the V2 FormApplication API for future-proofing. If missing, fail early in init.
// Provide a runtime alias so classes can be defined even when V2 is not present;
// the init-time check will still notify and throw if V2 is required.
const FormAppBase = foundry?.applications?.api?.FormApplicationV2 ?? FormApplication;

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
    const map = normalizePlaylistNameMap(game.settings.get("fvtt-combat_sounds_enhancer", "playlistNameMap") || {});
    const keys = Object.keys(DEFAULT_PLAYLIST_NAMES).sort();
    const labels = PLAYLIST_LABELS;
    // Available playlists in the world, sorted alphabetically by display name.
    const playlists = (game.playlists?.contents || [])
      .map(p => ({ id: p.id, name: p.name }))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    // Merged current mapping (defaults overridden by saved map) used for selection
    const current = foundry.utils.mergeObject(foundry.utils.mergeObject({}, DEFAULT_PLAYLIST_NAMES), map);
    // Normalize selection values to playlist IDs so the select is stable even when names change.
    const currentIds = {};
    for (const k of keys) {
      const resolved = getPlaylistByKey(k);
      currentIds[k] = resolved?.id || current[k] || "";
    }
    return { map, defaults: DEFAULT_PLAYLIST_NAMES, keys, labels, playlists, current, currentIds };
  }

  async _updateObject(event, formData) {
    const newMap = buildPlaylistNameMapFromSubmission(formData, event);
    await game.settings.set("fvtt-combat_sounds_enhancer", "playlistNameMap", newMap);
    const persisted = game.settings.get("fvtt-combat_sounds_enhancer", "playlistNameMap") || {};
    console.log("fvtt-combat_sounds_enhancer: Saved playlistNameMap", persisted);
    ui.notifications?.info("Combat Sounds Enhancer: Playlist mapping saved.");
  }
}

class HypeTrackConfigForm extends FormAppBase {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Hype Track Assignments",
      id: "hype-track-config",
      template: "modules/fvtt-combat_sounds_enhancer/templates/hype-track-config.html",
      width: 600,
      height: "auto"
    });
  }

  getData(options) {
    const assignments = game.settings.get("fvtt-combat_sounds_enhancer", "pcHypeTracks") || {};
    const hypePlaylist = getPlaylistByKey("hypeTracks");
    if (!hypePlaylist) {
      const rawMap = game.settings.get("fvtt-combat_sounds_enhancer", "playlistNameMap") || {};
      console.warn("fvtt-combat_sounds_enhancer: Hype Track Assignments could not resolve the hypeTracks playlist", { playlistNameMap: rawMap });
    }
    const rawSounds = getPlaylistSounds(hypePlaylist);
    const sounds = rawSounds
      .map(s => {
        const id = getSoundId(s);
        const reference = getSoundReference(s);
        return {
          name: getSoundDisplayName(s),
          value: id || reference,
          reference
        };
      })
      .filter(s => s.value.length > 0);
    if (hypePlaylist && sounds.length === 0) {
      console.warn(`fvtt-combat_sounds_enhancer: Hype playlist \"${hypePlaylist.name}\" resolved but no playable sounds were detected`);
    }
    const playerCharacters = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner).sort((a, b) => a.name.localeCompare(b.name));
    
    return {
      assignments,
      sounds,
      playerCharacters,
      hasSounds: sounds.length > 0,
      debug: {
        playlistName: hypePlaylist?.name || "(unresolved)",
        rawSoundCount: rawSounds.length,
        optionCount: sounds.length,
        pcCount: playerCharacters.length
      }
    };
  }

  async _updateObject(event, formData) {
    const newAssignments = {};
    for (const [actorId, soundPath] of Object.entries(formData)) {
      if (soundPath && String(soundPath).trim().length > 0) {
        newAssignments[actorId] = String(soundPath).trim();
      }
    }
    await game.settings.set("fvtt-combat_sounds_enhancer", "pcHypeTracks", newAssignments);
  }
}

Hooks.once("ready", () => {
  isMonkCombatDetailsActive = game.modules.get("monks-combat-details")?.active;
});
Hooks.once("init", async () => {
  console.log("fvtt-combat_sounds_enhancer: init hook starting");
  // Use the namespaced loadTemplates when available (newer Foundry); fall back
  // to the global `loadTemplates` for V13 compatibility.
  try {
    const loadTemplatesFn = foundry?.applications?.handlebars?.loadTemplates ?? loadTemplates;
    await loadTemplatesFn([
      "modules/fvtt-combat_sounds_enhancer/templates/playlist-name-config.html",
      "modules/fvtt-combat_sounds_enhancer/templates/hype-track-config.html"
    ]);
  } catch (error) {
    console.warn("fvtt-combat_sounds_enhancer: Failed to load templates", error);
  }

  console.log("fvtt-combat_sounds_enhancer: templates loaded");


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
    default: {}
  });

  // Migrate legacy/invalid mapping shapes so lookups remain reliable.
  const rawPlaylistMap = game.settings.get("fvtt-combat_sounds_enhancer", "playlistNameMap") || {};
  const normalizedPlaylistMap = normalizePlaylistNameMap(rawPlaylistMap);
  const mapsDiffer = JSON.stringify(rawPlaylistMap) !== JSON.stringify(normalizedPlaylistMap);
  if (mapsDiffer) {
    await game.settings.set("fvtt-combat_sounds_enhancer", "playlistNameMap", normalizedPlaylistMap);
  }

  // Store hype track assignments (actor ID -> sound path mapping)
  game.settings.register("fvtt-combat_sounds_enhancer", "pcHypeTracks", {
    name: "PC Hype Tracks",
    scope: "world",
    config: false,
    type: Object,
    default: {}
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

});

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
  const selectedValue = assignments[actor.id];
  if (!selectedValue) return;

  const playlist = getPlaylistByKey("hypeTracks");
  if (!playlist) return;

  const collectionSound = typeof playlist.sounds?.get === "function" ? playlist.sounds.get(selectedValue) : null;
  const sound = collectionSound || getPlaylistSounds(playlist).find(s => {
    const id = getSoundId(s);
    const reference = getSoundReference(s);
    return id === selectedValue || reference === selectedValue;
  });
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