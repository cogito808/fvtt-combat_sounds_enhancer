// scripts/fvtt-combat_sounds_enhancer.js

let isMonkCombatDetailsActive = false;
let combatStartLock = Promise.resolve();

// Default playlist name mapping. Use `getPlaylistByKey(key)` to look up playlists
// so playlist names can be changed centrally or via a setting in the future.
const DEFAULT_PLAYLIST_NAMES = {
  combatStart: "Combat Starts",
  hypeTracks: "Hype Tracks",
  deathSounds: "Death Sounds",
  criticalSuccess: "Critical Success",
  criticalFailure: "Critical Failure",
  heroPoints: "Hero Points"
};

// Human-friendly labels for the form UI (first word capitalized, space-separated)
const PLAYLIST_LABELS = {
  combatStart: "Combat Start",
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
  try {
    const overrides = game?.settings?.get?.("fvtt-combat_sounds_enhancer", "playlistNameMap") || {};
    // mergeObject is a Foundry helper already used in this file
  const names = foundry.utils.mergeObject(foundry.utils.mergeObject({}, DEFAULT_PLAYLIST_NAMES), overrides);
    const name = names[key];
    if (!name) return null;
    return game.playlists.getName(name) || null;
  } catch (e) {
    console.warn("getPlaylistByKey error:", e);
    return null;
  }
}

function getRandomValidSoundFromPlaylist(playlist) {
  if (!playlist || !playlist.sounds || playlist.sounds.length === 0) return null;
  const validSounds = playlist.sounds.filter(s => s.path);
  if (validSounds.length === 0) return null;
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
    "modules/fvtt-combat_sounds_enhancer/templates/playlist-name-config.html"
  ]);

  // Register custom data field for hype track on token prototypes
  if (foundry?.data?.fields) {
    const fields = foundry.data.fields;
    CONFIG.Actor.dataModels = CONFIG.Actor.dataModels || {};
    const DataModel = foundry.abstract.DataModel;
    
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

  // Allow an optional mapping from logical keys to playlist names so maintainers
  // or users can override playlist names without changing code.
  game.settings.register("fvtt-combat_sounds_enhancer", "playlistNameMap", {
    name: "Playlist Name Map",
    scope: "world",
    config: false,
    type: Object,
    default: DEFAULT_PLAYLIST_NAMES
  });

  // A hidden switch to allow automatic application of detected overrides.
  game.settings.register("fvtt-combat_sounds_enhancer", "playlistNameMapAutoApply", {
    name: "Auto-apply playlist name overrides",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
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

  // Migration stub: detect if stored overrides differ from defaults and log.
  // If the hidden boolean `playlistNameMapAutoApply` is true, write the merged
  // mapping back to settings (this is opt-in and disabled by default).
  try {
    const current = game.settings.get("fvtt-combat_sounds_enhancer", "playlistNameMap") || {};
    const autoApply = game.settings.get("fvtt-combat_sounds_enhancer", "playlistNameMapAutoApply");
    // Simple deep-inequality check via JSON stringify (acceptable for small map)
    const differs = JSON.stringify(current) !== JSON.stringify(DEFAULT_PLAYLIST_NAMES);
    if (differs) {
      // Detected playlistNameMap overrides; do not log by default. Set 'playlistNameMapAutoApply' to true to apply automatically.
      if (autoApply) {
        const merged = foundry.utils.mergeObject(foundry.utils.mergeObject({}, DEFAULT_PLAYLIST_NAMES), current);
        game.settings.set("fvtt-combat_sounds_enhancer", "playlistNameMap", merged);
      }
    }
  } catch (e) {
    console.warn("fvtt-combat_sounds_enhancer: playlistNameMap migration check failed:", e);
  }
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
 * Hook to extend token prototype configuration with hype track selector.
 * This adds the hype track field to the biography/notes tab for all actor types (characters, NPCs, etc.).
 * Supports both V1 and V2 form applications.
 */
function addHypeTrackSelector(html, app) {
  try {
    // Ensure html is a jQuery object (V1 passes jQuery, V2 passes DOM elements)
    if (!(html instanceof jQuery)) {
      html = $(html);
    }
    
    // Add for any actor type except certain system-specific types to exclude
    const excludeTypes = ["hazard"]; // Exclude hazards and similar non-character types
    if (excludeTypes.includes(app.actor?.type)) return;
    
    const playlist = getPlaylistByKey('hypeTracks');
    if (!playlist || !playlist.sounds || playlist.sounds.length === 0) {
      console.warn("fvtt-combat_sounds_enhancer: No hype tracks playlist found");
      return;
    }

    const sounds = playlist.sounds.map(s => ({ name: s.name, path: s.path }));
    const currentHypeTrack = app.actor.prototypeToken?.getFlag?.("fvtt-combat_sounds_enhancer", "hypeTrack") || "";

    // Create the form group HTML with a section header
    let html_content = `
      <section class="hype-track-section">
        <h3 class="form-header">Hype Track</h3>
        <div class="form-group">
          <select id="hype-track-selector" name="hype-track">
            <option value="">None</option>
    `;
    
    for (const sound of sounds) {
      const selected = currentHypeTrack === sound.path ? 'selected' : '';
      html_content += `<option value="${sound.path}" ${selected}>${sound.name}</option>`;
    }
    
    html_content += `</select></div></section>`;

    // For PF2e, find the biography tab content div specifically
    let targetTab = html.find('.sheet-body [data-tab="biography"]');
    
    // Fallback for other systems: try notes tab
    if (!targetTab.length) {
      targetTab = html.find('.sheet-body [data-tab="notes"]');
    }
    
    // Last resort: try to find biography/notes tab without sheet-body prefix
    if (!targetTab.length) {
      targetTab = html.find('[data-tab="biography"]');
    }
    if (!targetTab.length) {
      targetTab = html.find('[data-tab="notes"]');
    }

    if (targetTab && targetTab.length) {
      // Insert at the beginning of the target tab content
      targetTab.first().prepend(html_content);
    } else {
      console.warn("fvtt-combat_sounds_enhancer: Could not find biography/notes tab for actor sheet", app.actor.type);
    }
      
    // Add change event listener
    html.find("#hype-track-selector").on("change", async (event) => {
      const selectedPath = event.target.value;
      if (selectedPath) {
        await app.actor.prototypeToken.setFlag("fvtt-combat_sounds_enhancer", "hypeTrack", selectedPath);
      } else {
        await app.actor.prototypeToken.unsetFlag("fvtt-combat_sounds_enhancer", "hypeTrack");
      }
    });
  } catch (e) {
    console.warn("Error adding hype track selector to actor sheet:", e);
  }
}

// Support for V1 sheets (PF2e and older systems)
Hooks.on("renderActorSheet", (app, html, data) => {
  addHypeTrackSelector(html, app);
});

// Support for V2 sheets (D&D 5e and newer systems)
Hooks.on("renderActorSheetV2", (app, html, data) => {
  addHypeTrackSelector(html, app);
});

/**
 * Helper: detect whether a PF2e chat message context represents an attack roll.
 *
 * Rationale: PF2e sends multiple chat messages (attack roll, damage roll, etc.) that
 * share the same `flags.pf2e.context` structure. Without a more specific guard the
 * module can trigger critical sounds on damage messages. This helper tries a few
 * defensive checks found commonly in PF2e message contexts to approximate an attack.
 *
 * Assumptions (conservative):
 * - context.type === 'attack-roll' indicates an attack roll; OR
 * - context.actionType === 'attack' indicates an attack; OR
 * - context.item?.type === 'weapon' is likely an attack-related message.
 * If none of these fields exist we default to false to avoid false positives.
 */
function isPf2eAttackContext(context) {
  if (!context || typeof context !== 'object') return false;
  // Explicit attack markers
  if (context.type === 'attack-roll') return true;
  if (context.actionType === 'attack') return true;
  // Some PF2e messages include a 'roll' object with a type
  if (context.roll && context.roll.type === 'attack') return true;
  // `attackRoll` boolean or similar flags
  if (context.attackRoll === true) return true;
  // Items of type 'weapon' are likely attack messages (but could be used elsewhere)
  try {
    if (context.item && context.item.type === 'weapon') return true;
  } catch (e) {
    // defensive: fall through
  }

  // Heuristic: if the context explicitly seems to be a damage roll, reject
  if (context.roll && context.roll.type === 'damage') return false;
  if (String(context.type).toLowerCase().includes('damage')) return false;

  // Fallback permissive checks: originType sometimes contains 'Item' or 'Weapon'
  if (typeof context.originType === 'string' && /item|weapon/i.test(context.originType)) return true;

  // Last resort: don't assume it's an attack to avoid false positives
  return false;
}

function isPf2eAttackMessage(message) {
  const context = message?.flags?.pf2e?.context;
  return isPf2eAttackContext(context);
}

function isPf2eDamageContext(context) {
  if (!context || typeof context !== 'object') return false;
  // Common indicators of damage rolls
  if (context.roll && context.roll.type === 'damage') return true;
  if (Array.isArray(context.roll?.types) && context.roll.types.includes('damage')) return true;
  if (String(context.type).toLowerCase().includes('damage')) return true;
  return false;
}

Hooks.on("combatStart", (combat, options, userId) => {
  if (!game.user.isGM) return;
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableCombatStarts")) return;

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
  if (!("turn" in updateData)) return;

  const actor = combat.combatant?.actor;
  if (!actor) return;

  // Get the hype track from the actor's prototype token
  const hypeTrackPath = actor.prototypeToken?.getFlag?.("fvtt-combat_sounds_enhancer", "hypeTrack") || "";
  if (!hypeTrackPath) return;

  const playlist = getPlaylistByKey('hypeTracks');
  // Resolve by sound.path
  const sound = playlist?.sounds.find(s => s.path === hypeTrackPath);
  if (!sound) return;

  await combatStartLock;
  await playlist.playSound(sound);
});

Hooks.on("updateCombatant", async (combatant, updateData) => {
  if (!game.user.isGM) return;
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableDeathSounds")) return;
  if (!updateData.defeated) return;

  const actor = combatant.actor;
  if (!actor || actor.type === "character") return;

  const playlist = getPlaylistByKey('deathSounds');
  const sound = getRandomValidSoundFromPlaylist(playlist);
  if (!sound || !playlist) return;

  await playlist.playSound(sound);
});

Hooks.on("preCreateChatMessage", async (message, options, userId) => {
  if (!game.user.isGM) return;
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableCriticalSounds")) return;
  const flags = message.flags?.pf2e?.context;
  // Minimal logging: only warn on missing flags when debugging
  if (!flags) return;

  // If this message explicitly marks a critical, play the critical sound
  // (allow skill checks and non-attack criticals). Exclude damage rolls.
  const isCriticalSuccess = !!flags.isCriticalSuccess;
  const isCriticalFailure = !!flags.isCriticalFailure;
  if (!isCriticalSuccess && !isCriticalFailure) return;
  if (isPf2eDamageContext(flags)) return;

  // Use the same logical keys as the createChatMessage handler
  const playlistKey = isCriticalSuccess ? 'criticalSuccess' : 'criticalFailure';
  const playlist = getPlaylistByKey(playlistKey);
  const sound = getRandomValidSoundFromPlaylist(playlist);
  if (!sound || !playlist) return;

  await playlist.playSound(sound);
});

Hooks.on("createChatMessage", async (message) => {
  if (!game.user.isGM) return;
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableCriticalSounds")) return;
  const context = message.flags?.pf2e?.context;
  const outcome = context?.outcome;
  const unadjustedOutcome = context?.unadjustedOutcome;

  

  // Play on critical outcomes (accept skill checks and non-attack messages).
  // Skip explicit damage rolls to avoid duplicate sounds on damage messages.
  const criticalOutcome = outcome || unadjustedOutcome;
  if (!criticalOutcome) return;
  if (!["criticalSuccess", "criticalFailure"].includes(criticalOutcome)) return;
  if (isPf2eDamageContext(context)) return;

  // Use the centralized mapping for critical success/failure
  const playlistKey = criticalOutcome === 'criticalSuccess' ? 'criticalSuccess' : 'criticalFailure';
  const p = getPlaylistByKey(playlistKey);
  const s = getRandomValidSoundFromPlaylist(p);
  if (!s || !p) {
    console.warn(`No valid sound found for '${criticalOutcome}'`);
    return;
  }

  await p.playSound(s);
});

// Track previous hero points state for hero point usage detection
const previousHeroPointCounts = new WeakMap();

Hooks.on("updateActor", async (actor, updateData, options, userId) => {
  if (!game.user.isGM) return;
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableHeroPointSounds")) return;

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