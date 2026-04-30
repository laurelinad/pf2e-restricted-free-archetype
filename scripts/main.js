const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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

class RestrictedFreeArchetypeSettings extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "pf2e-restricted-free-archetype-menu",
    tag: "form",
    classes: ["standard-form"],
    window: {
      title: "Configure Free Archetype Levels",
      icon: "fas fa-cog"
    },
    position: {
      width: 500,
      height: "auto"
    },
    form: {
      handler: RestrictedFreeArchetypeSettings.onSubmit,
      closeOnSubmit: true,
      submitOnChange: false
    }
  }

  static PARTS = {
    form: {
      template: "modules/pf2e-restricted-free-archetype/templates/settings-menu.hbs"
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const currentLevels = game.settings.get("pf2e-restricted-free-archetype", "restrictedArchetypeLevels");
    const evenLevels = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];

    // Sanity check - shouldn't be necessary but you never know
    const levels = {};
    evenLevels.forEach(level => {
      levels[level] = currentLevels.includes(level);
    });

    context.levels = levels;

    // Add submit button
    context.buttons = [
      { type: "submit", icon: "fa-solid fa-save", label: "Save Changes" }
    ];

    return context;
  }

  static async onSubmit(event, form, formData) {
    const selectedLevels = Object.entries(formData.object)
      .filter(([level, enabled]) => enabled)
      .map(([level, enabled]) => parseInt(level, 10));

    await game.settings.set("pf2e-restricted-free-archetype", "restrictedArchetypeLevels", selectedLevels);
    
    // Refresh all open character sheets to reflect changes immediately
    // Should support both legacy and modern sheets
    Object.values(ui.windows).forEach(app => {
      if (app.document?.documentName === "Actor" || app instanceof ActorSheet) {
        app.document.prepareData();
        app.render(true);
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