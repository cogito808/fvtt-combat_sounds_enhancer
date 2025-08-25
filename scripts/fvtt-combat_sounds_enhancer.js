let isMonkCombatDetailsActive = false;
let combatStartLock = Promise.resolve();

Hooks.once("ready", () => {
  isMonkCombatDetailsActive = game.modules.get("monks-combat-details")?.active;
});

Hooks.once("init", () => {
  game.settings.registerMenu("FVTT-Hype_Tracks", "trackConfig", {
    name: "Hype Track Assignment",
    label: "Configure Actor Tracks",
    hint: "Assign a playlist track to each player character.",
    icon: "fas fa-music",
    type: HypeTrackConfigForm,
    restricted: true
  });

  game.settings.register("FVTT-Hype_Tracks", "actorTrackMap", {
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
      template: "modules/FVTT-Hype_Tracks/templates/track-config.html",
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
      if (value) newMap[key] = value;
    }
    await game.settings.set("FVTT-Hype_Tracks", "actorTrackMap", newMap);
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

    await playlist.playSound(sound);

    while (sound.playing) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  })();
});

Hooks.on("updateCombat", async (combat, updateData) => {
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