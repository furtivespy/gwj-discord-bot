class Event {
  constructor(client, {
    name = null,
    eventType = "",
    qualifier = "",
    description = "No description provided.",
    category = "Miscellaneous",
    usage = "No usage provided.",
    enabled = true,
    guildOnly = false,
    showHelp = false,
    permLevel = "User",
    once = false,
  } = {}) {
    this.client = client;
    this.conf = { enabled, guildOnly, permLevel, showHelp, once };
    this.help = { name, eventType, qualifier, description, category, usage };
  }

  pause(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async run() {}
}

export default Event;
