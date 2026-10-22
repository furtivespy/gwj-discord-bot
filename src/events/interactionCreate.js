const Event = require("../base/Event.js");
const EventTypes = require("../base/EventTypes.js");
const { routeInteraction } = require("../handlers/interactionRouter");

class InteractionCreate extends Event {
  constructor(client) {
    super(client, {
      name: "interactionCreate",
      eventType: EventTypes.INTERACTION_CREATE,
      description:
        "Routes slash commands, autocomplete, buttons, select menus, and modals.",
      enabled: true,
    });
  }

  async run(interaction) {
    await routeInteraction(this.client, interaction);
  }
}

module.exports = InteractionCreate;
