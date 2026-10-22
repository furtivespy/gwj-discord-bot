const Event = require("../base/Event.js");
const EventTypes = require("../base/EventTypes.js");

class Ready extends Event {
  constructor(client) {
    super(client, {
      name: "ready",
      eventType: EventTypes.READY,
      description: "Logged when the Discord client is ready.",
      enabled: true,
      once: true,
    });
  }

  async run() {
    this.client.logger.ready("Ready!");
  }
}

module.exports = Ready;
