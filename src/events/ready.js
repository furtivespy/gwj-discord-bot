import Event from "../base/Event.js";
import EventTypes from "../base/EventTypes.js";

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
    try {
      if (this.client.application?.fetch) {
        this.client.appInfo = await this.client.application.fetch();
      }
    } catch (error) {
      this.client.logger?.error(error, "ready.js");
    }
    this.client.logger.ready("Ready!");
  }
}

export default Ready;
