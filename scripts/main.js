
Hooks.once("init", () => {
  game.settings.registerMenu("pf2e-restricted-free-archetype", "settingsMenu", {
    name: "Configure Free Archetype Levels",
    label: "Open Configuration",
    hint: "Manage which levels grant a Free Archetype feat.",
    icon: "fas fa-cog",
    type: RestrictedFreeArchetypeSettings,
    restricted: true
  });

  game.settings.register("pf2e-restricted-free-archetype", "restrictedArchetypeLevels", {
    scope: "world",
    config: false, // hidden
    type: Array,
    default: "2, 4, 6, 8, 10, 12, 14, 16, 18, 20",
  });
});

class RestrictedFreeArchetypeSettings extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "pf2e-restricted-free-archetype-menu",
      title: "Configure Free Archetype Levels",
      template: "modules/pf2e-restricted-free-archetype/templates/settings-menu.hbs",
      width: 500,
      height: "auto",
      closeOnSubmit: true
    });
  }

  getData() {
    const currentLevels = game.settings.get("pf2e-restricted-free-archetype", "restrictedArchetypeLevels");
    const evenLevels = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

    // Sanity check - shouldn't be necessary but you never know
    const levels = {};
    evenLevels.forEach(level => {
      levels[level] = currentLevels.includes(level);
    });

    return { levels };
  }

  async _updateObject(event, formData) {
    // formData format: { "2": true, "4": false, ... }
    const selectedLevels = Object.entries(formData)
      .filter(([level, enabled]) => enabled)
      .map(([level, enabled]) => parseInt(level, 10));

    await game.settings.set("pf2e-restricted-free-archetype", "restrictedArchetypeLevels", selectedLevels);
    
    // Refresh all open character sheets to reflect changes immediately
    Object.values(ui.windows).forEach(app => {
      if (app instanceof ActorSheet) {
         app.render();
      }
    });
  }
}

Hooks.once("ready", () => {
  console.log("Registering libWrapper patch for PF2e Restricted Free Archetype")
  // Use libWrapper to modify the bonus feats granted by the free archetype rule
  libWrapper.register(
    "pf2e-restricted-free-archetype",
    //"CONFIG.PF2E.Actor.documentClasses.character.prototype.prepareDerivedData",
    "CONFIG.Actor.sheetClasses.character['pf2e.CharacterSheetPF2e'].cls.prototype.getData",
    async function (wrapped, ...args) {
      // Call the original function
      const data = await wrapped(...args);

      // Check if Free Archetype is enabled
      const variantEnabled = game.settings.get("pf2e", "freeArchetypeVariant");
      if (!variantEnabled) return data;

      const customLevels = game.settings.get("pf2e-restricted-free-archetype", "restrictedArchetypeLevels");

      // Ensure the archetype group exists
      if (data.feats && Array.isArray(data.feats)) {
        // Adjust the slots to match the custom levels
        const archetypeFeats = data.feats.find(feat => feat.id === "archetype");

        archetypeFeats.feats = archetypeFeats.feats.filter(feat => customLevels.includes(feat.level));

        for (const slotId of Object.keys(archetypeFeats.slots)) {
          if (!customLevels.includes(archetypeFeats.slots[slotId].level)) {
            delete archetypeFeats.slots[slotId];
          }
        }
        return data;
      }
    },
    "WRAPPER"
  );
});