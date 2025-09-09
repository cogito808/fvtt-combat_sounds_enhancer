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

  game.settings.register("FVTT-Hype_Tracks", "enableHypeTracks", {
    name: "Enable Hype Tracks",
    hint: "Play hype track for each actor on their turn.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    order: 1
  });

  game.settings.register("FVTT-Hype_Tracks", "enableCombatStarts", {
    name: "Enable Combat Starts",
    hint: "Play sound when combat starts.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    order: 2
  });

  game.settings.register("FVTT-Hype_Tracks", "enableDeathSounds", {
    name: "Enable Death Sounds",
    hint: "Play sound when non-character actor is defeated.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    order: 3
  });

  game.settings.register("FVTT-Hype_Tracks", "enableCriticalSounds", {
    name: "Enable Critical Sounds",
    hint: "Play sound on critical success or failure.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    order: 4
  });

  game.settings.register("FVTT-Hype_Tracks", "actorTrackMap", {
    name: "Actor Track Map",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  // Register the menu last so it appears at the bottom of the settings UI
  game.settings.registerMenu("FVTT-Hype_Tracks", "trackConfig", {
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
    const trackMap = game.settings.get("FVTT-Hype_Tracks", "actorTrackMap");
    return { actors, sounds, trackMap };
  }

  async _updateObject(event, formData) {
    const newMap = {};
    for (const [key, value] of Object.entries(formData)) {
      if (value) {
        newMap[key] = value;
      }
    }
    await game.settings.set("FVTT-Hype_Tracks", "actorTrackMap", newMap);
  }
}

Handlebars.registerHelper("ifEquals", function(a, b, options) {
  return a === b ? options.fn(this) : options.inverse(this);
});

Hooks.on("combatStart", (combat, options, userId) => {
  if (!game.user.isGM) return;
  if (!game.settings.get("FVTT-Hype_Tracks", "enableCombatStarts")) return;

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
  if (!game.settings.get("FVTT-Hype_Tracks", "enableHypeTracks")) return;
  if (!("turn" in updateData)) return;

  const actorId = combat.combatant?.actor?.id;
  const trackMap = game.settings.get("FVTT-Hype_Tracks", "actorTrackMap");
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
  if (!game.settings.get("FVTT-Hype_Tracks", "enableDeathSounds")) return;
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
  if (!game.settings.get("FVTT-Hype_Tracks", "enableCriticalSounds")) return;
  const flags = message.flags?.pf2e?.context;
  console.log("PF2E Flags:", flags);
  if (!flags) return;

  let playlistName = null;
  if (flags.isCriticalSuccess) playlistName = "Critical Hits";
  else if (flags.isCriticalFailure) playlistName = "Critical Miss";
  else return;

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
  if (!game.settings.get("FVTT-Hype_Tracks", "enableCriticalSounds")) return;

  const context = message.flags?.pf2e?.context;
  const outcome = context?.outcome;
  const unadjustedOutcome = context?.unadjustedOutcome;

  console.log("Outcome:", outcome);
  console.log("Unadjusted Outcome:", unadjustedOutcome);

  let playlistName = null;
  if (outcome === "criticalSuccess") playlistName = "Critical Success";
  else if (outcome === "criticalFailure") playlistName = "Critical Failure";
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

  console.log(`🎯 Playing '${outcome}' sound: ${sound.name}`);
  await playlist.playSound(sound);
});