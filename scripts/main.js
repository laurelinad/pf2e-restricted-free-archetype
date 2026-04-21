
Hooks.once("init", () => {
  game.settings.register("pf2e-restricted-free-archetype", "restrictedArchetypeLevels", {
    name: "Enabled Free Archetype Levels",
    hint: "Select the levels at which characters should receive a free archetype feat.",
    scope: "world",
    config: true,
    type: Array,
    default: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
    choices: {
      2: "Level 2",
      4: "Level 4",
      6: "Level 6",
      8: "Level 8",
      10: "Level 10",
      12: "Level 12",
      14: "Level 14",
      16: "Level 16",
      18: "Level 18",
      20: "Level 20",
    },
  });

  // Register menu for setting changes
  game.settings.registerMenu("pf2e-restricted-free-archetype", "refreshCharacters", {
    name: "Apply Changes to Existing Characters",
    label: "Apply Now",
    hint: "Recalculate free archetype feats for all characters with the new settings.",
    icon: "fas fa-sync",
    type: RefreshCharactersMenu,
    restricted: true,
  });
});

// Handle the refresh action
class RefreshCharactersMenu extends FormApplication {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      title: "Apply Free Archetype Level Changes",
      id: "free-archetype-levels-refresh",
      template: "templates/refresh-menu.html",
      width: 400,
    });
  }

  async _updateObject(event, formData) {
    const variantEnabled = game.settings.get("pf2e", "freeArchetypeVariant");
    if (!variantEnabled) {
      ui.notifications.warn("Free Archetype variant rule is not enabled.");
      return;
    }

    const customLevels = game.settings.get("pf2e-restricted-free-archetype", "restrictedArchetypeLevels");
    let updated = 0;

    // Iterate over all characters
    for (const actor of game.actors.contents) {
      if (actor.type !== "character") continue;
      const feats = actor.itemTypes.feat;
      const level = actor.level;
      const hasFreeArchetype = feats.some(f => f.system.rules.some(r => r.key === "RuleElement.FreeArchetype"));

      // Logic to add/remove Free Archetype feat based on new setting
      if (customLevels.includes(level)) {
        if (!hasFreeArchetype) {
          // Grant the feat (simplified example)
          await actor.createEmbeddedDocuments("Item", [{
            name: "Free Archetype Feat",
            type: "feat",
            system: { rules: [{ key: "RuleElement.FreeArchetype" }] },
          }]);
          updated++;
        }
      } else if (hasFreeArchetype) {
        // Remove the feat
        const toRemove = feats.find(f => f.system.rules.some(r => r.key === "RuleElement.FreeArchetype"));
        if (toRemove) await actor.deleteEmbeddedDocuments("Item", [toRemove.id]);
        updated++;
      }
    }

    ui.notifications.info(`Updated ${updated} characters.`);
  }
}

Hooks.once("ready", () => {
  // Only apply logic in case the game system is Pathfinder 2e
  if (game.system.id !== "pf2e") return;

  // Use libWrapper to modify the bonus feats granted by the free archetype rule
  libWrapper.register(
    "pf2e-restricted-free-archetype",
    "CONFIG.PF2E.Actor.Character.Feats.prototype.getBonusFeats",
    function (wrapped, ...args) {
      const bonusFeats = wrapped(...args);
      const level = this.actor.level;
      const variantEnabled = game.settings.get("pf2e", "freeArchetypeVariant");
      const customLevels = game.settings.get("pf2e-restricted-free-archetype", "restrictedArchetypeLevels");

      if (variantEnabled) {
        // Remove any existing Free Archetype feats
        const index = bonusFeats.findIndex(f => f.type === "freeArchetype");
        if (index !== -1) {
          bonusFeats.splice(index, 1);
        }
        // Add back if the level is in the custom list
        if (customLevels.includes(level)) {
          bonusFeats.push({
            level,
            type: "freeArchetype",
            uuid: "Compendium.pf2e.feats.Item.ArchetypeDedication",
          });
        }
      }

      return bonusFeats;
    },
    "WRAPPER"
  );
});