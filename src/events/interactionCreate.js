import Event from "../base/Event.js";
import EventTypes from "../base/EventTypes.js";
import { routeInteraction } from "../handlers/interactionRouter.js";

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

export default InteractionCreate;
