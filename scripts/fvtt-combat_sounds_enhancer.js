// scripts/fvtt-combat_sounds_enhancer.js

let isMonkCombatDetailsActive = false;
let combatStartLock = Promise.resolve();

Hooks.once("ready", () => {
  isMonkCombatDetailsActive = game.modules.get("monks-combat-details")?.active;
});

Hooks.once("init", () => {
  loadTemplates([
    "modules/fvtt-combat_sounds_enhancer/templates/track-config.html"
  ]);

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

  game.settings.register("fvtt-combat_sounds_enhancer", "actorTrackMap", {
    name: "Actor Track Map",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  // Register the menu last so it appears at the bottom of the settings UI
  game.settings.registerMenu("fvtt-combat_sounds_enhancer", "trackConfig", {
    name: "🎵 Configure Actor Tracks (Hype Tracks)",
    label: "Hype Track Assignment",
    hint: "Assign tracks to actors. Only used if Hype Tracks are enabled.",
    icon: "fas fa-music",
    type: HypeTrackConfigForm,
    restricted: true,
    order: 99
  });
});

class HypeTrackConfigForm extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      title: "Hype Track Assignment",
      id: "hype-track-config",
      template: "modules/fvtt-combat_sounds_enhancer/templates/track-config.html",
      width: 400
    });
  }

  getData() {
    const actors = game.actors.filter(a => a.type === "character");
    const playlists = game.playlists.contents.filter(p => p.name === "Hype Tracks");
    const sounds = playlists.flatMap(p => p.sounds.map(s => s.name));
    const trackMap = game.settings.get("fvtt-combat_sounds_enhancer", "actorTrackMap");
    return { actors, sounds, trackMap };
  }

  async _updateObject(event, formData) {
    const newMap = {};
    for (const [key, value] of Object.entries(formData)) {
      if (value) {
        newMap[key] = value;
      }
    }
    await game.settings.set("fvtt-combat_sounds_enhancer", "actorTrackMap", newMap);
  }
}

Handlebars.registerHelper("ifEquals", function(a, b, options) {
  return a === b ? options.fn(this) : options.inverse(this);
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

    const playlist = game.playlists.getName("Combat Starts");
    if (!playlist || playlist.sounds.length === 0) return;

    const validSounds = playlist.sounds.filter(s => s.path);
    const sound = validSounds[Math.floor(Math.random() * validSounds.length)];
    if (!sound) return;

    await playlist.playSound(sound);

    while (sound.playing) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  })();
});

Hooks.on("updateCombat", async (combat, updateData) => {
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableHypeTracks")) return;
  if (!("turn" in updateData)) return;

  const actorId = combat.combatant?.actor?.id;
  const trackMap = game.settings.get("fvtt-combat_sounds_enhancer", "actorTrackMap");
  const soundName = trackMap[actorId];
  if (!soundName) return;

  const playlist = game.playlists.getName("Hype Tracks");
  const sound = playlist?.sounds.find(s => s.name === soundName);
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

  const playlist = game.playlists.getName("Death Sounds");
  if (!playlist || playlist.sounds.length === 0) return;

  const validSounds = playlist.sounds.filter(s => s.path);
  const sound = validSounds[Math.floor(Math.random() * validSounds.length)];
  if (!sound) return;

  await playlist.playSound(sound);
});

Hooks.on("preCreateChatMessage", async (message, options, userId) => {
  if (!game.user.isGM) return;
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableCriticalSounds")) return;
  const flags = message.flags?.pf2e?.context;
  console.log("PF2E Flags:", flags);
  if (!flags) return;

  // If this message explicitly marks a critical, play the critical sound
  // (allow skill checks and non-attack criticals). Exclude damage rolls.
  const isCriticalSuccess = !!flags.isCriticalSuccess;
  const isCriticalFailure = !!flags.isCriticalFailure;
  if (!isCriticalSuccess && !isCriticalFailure) return;
  if (isPf2eDamageContext(flags)) return;

  const playlistName = isCriticalSuccess ? "Critical Hits" : "Critical Miss";
  const playlist = game.playlists.getName(playlistName);
  if (!playlist || playlist.sounds.length === 0) return;

  const validSounds = playlist.sounds.filter(s => s.path);
  const sound = validSounds[Math.floor(Math.random() * validSounds.length)];
  if (!sound) return;

  console.log(`Playing sound: ${sound.name}`);
  await playlist.playSound(sound);
});

Hooks.on("createChatMessage", async (message) => {
  if (!game.user.isGM) return;
  if (!game.settings.get("fvtt-combat_sounds_enhancer", "enableCriticalSounds")) return;
  const context = message.flags?.pf2e?.context;
  const outcome = context?.outcome;
  const unadjustedOutcome = context?.unadjustedOutcome;

  console.log("Outcome:", outcome);
  console.log("Unadjusted Outcome:", unadjustedOutcome);

  // Play on critical outcomes (accept skill checks and non-attack messages).
  // Skip explicit damage rolls to avoid duplicate sounds on damage messages.
  const criticalOutcome = outcome || unadjustedOutcome;
  if (!criticalOutcome) return;
  if (!["criticalSuccess", "criticalFailure"].includes(criticalOutcome)) return;
  if (isPf2eDamageContext(context)) return;

  let playlistName = null;
  if (criticalOutcome === "criticalSuccess") playlistName = "Critical Success";
  else if (criticalOutcome === "criticalFailure") playlistName = "Critical Failure";
  else return;

  const playlist = game.playlists.getName(playlistName);
  if (!playlist || playlist.sounds.length === 0) {
    console.warn(`Playlist '${playlistName}' not found or empty.`);
    return;
  }

  const validSounds = playlist.sounds.filter(s => s.path);
  const sound = validSounds[Math.floor(Math.random() * validSounds.length)];
  if (!sound) {
    console.warn(`No valid sound found in '${playlistName}'`);
    return;
  }

  console.log(`🎯 Playing '${criticalOutcome}' sound: ${sound.name}`);
  await playlist.playSound(sound);
});