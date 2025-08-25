let isMonkCombatDetailsActive = false;
let combatStartLock = Promise.resolve();

Hooks.once("ready", () => {
  isMonkCombatDetailsActive = game.modules.get("monks-combat-details")?.active;
});

Hooks.once("init", () => {
  game.settings.registerMenu("fvtt-combat_sounds_enhancer", "trackConfig", {
    name: "Hype Track Assignment",
    label: "Configure Actor Tracks",
    hint: "Assign a playlist track to each player character.",
    icon: "fas fa-music",
    type: HypeTrackConfigForm,
    restricted: true
  });

  game.settings.register("fvtt-combat_sounds_enhancer", "actorTrackMap", {
    name: "Actor Track Map",
    scope: "world",
    config: false,
    type: Object,
    default: {}
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
    ///for live(playerowned only) 
	const actors = game.actors.filter(a => a.hasPlayerOwner);
    ///for testing(all characters)    const actors = game.actors.filter(a => a.type === "character");
    const playlists = game.playlists.contents.filter(p => p.name === "Hype Tracks");
    const sounds = playlists.flatMap(p => p.sounds.map(s => s.name));
    const trackMap = game.settings.get("fvtt-combat_sounds_enhancer", "actorTrackMap");

    return { actors, sounds, trackMap };
  }

  async _updateObject(event, formData) {
    const newMap = {};
    for (const [key, value] of Object.entries(formData)) {
      if (value) newMap[key] = value;
    }
    await game.settings.set("fvtt-combat_sounds_enhancer", "actorTrackMap", newMap);
  }
}

Handlebars.registerHelper("ifEquals", function(a, b, options) {
  return a === b ? options.fn(this) : options.inverse(this);
});

Hooks.on("combatStart", (combat, options, userId) => {
  if (!game.user.isGM) return;

  const delay = isMonkCombatDetailsActive ? 500 : 0;

  combatStartLock = (async () => {
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));

    const playlist = game.playlists.getName("Combat Starts");
    if (!playlist || playlist.sounds.length === 0) return;

    const validSounds = playlist.sounds.filter(s => s.path);
    const sound = validSounds[Math.floor(Math.random() * validSounds.length)];
    if (!sound) return;

    console.log("🎬 Combat start sound triggered.");
    await playlist.playSound(sound);

    while (sound.playing) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("✅ Combat start sound finished.");
  })();
});

Hooks.on("updateCombat", async (combat, updateData) => {
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