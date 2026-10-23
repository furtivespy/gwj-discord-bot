class SlashCommand {
  constructor(client, {
    name = null,
    description = "No description provided.",
    usage = "No usage provided.",
    enabled = true,
    permLevel = "User",
  } = {}) {
    this.client = client;
    this.conf = { enabled, permLevel };
    this.help = { name, description, usage };
  }

  // Slash and autocomplete. Game Bot also sends autocomplete through execute();
  // override autocomplete() when the two paths should differ.
  // `conf.permLevel` is enforced by the interaction router (User / Moderator / …).
  async execute(_interaction) {}

  async autocomplete(interaction) {
    return this.execute(interaction);
  }

  // Component / modal interactions are routed here by customId prefix
  // (`{commandName}:...`, e.g. ping:again).
  async button(_interaction) {}

  async selectMenu(_interaction) {}

  async modal(_interaction) {}
}

export default SlashCommand;
