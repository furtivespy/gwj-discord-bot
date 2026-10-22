import { describe, expect, test } from "bun:test";
import { MessageFlags } from "discord.js";
import Status from "../src/commands/slash/status.js";
import { version } from "../package.json";

function silentLogger() {
  return {
    info() {},
    error() {},
    warn() {},
    debug() {},
    cmd() {},
    ready() {},
    time() {},
  };
}

function statusClient({ serverCount = 0 } = {}) {
  return {
    logger: silentLogger(),
    guilds: { cache: { size: serverCount } },
  };
}

describe("/status", () => {
  test("exposes slash metadata and formats uptime, version, and server count", () => {
    const status = new Status(statusClient());

    expect(status.data.name).toBe("status");
    expect(status.data.description).toBe(
      "Shows bot uptime, version, and server count"
    );
    expect(Status.formatUptime(0)).toBe("0s");
    expect(Status.formatUptime(90)).toBe("1m 30s");
    expect(Status.formatUptime(93784)).toBe("1d 2h 3m 4s");
    expect(
      Status.buildStatusLines({
        version: "1.2.3",
        uptimeSeconds: 90,
        serverCount: 4,
      })
    ).toBe("Version: 1.2.3\nUptime: 1m 30s\nServers: 4");
  });

  test("replies with the running version, formatted uptime, and guild count", async () => {
    const status = new Status(statusClient({ serverCount: 3 }));
    const replies = [];
    const originalUptime = process.uptime;
    process.uptime = () => 90;

    try {
      await status.execute({
        client: statusClient({ serverCount: 3 }),
        reply: async (payload) => {
          replies.push(payload);
        },
      });
    } finally {
      process.uptime = originalUptime;
    }

    expect(replies).toHaveLength(1);
    expect(replies[0].flags).toBe(MessageFlags.Ephemeral);
    expect(replies[0].content).toBe(
      `Version: ${version}\nUptime: 1m 30s\nServers: 3`
    );
    expect(replies[0].content).toContain(Status.formatUptime(90));
  });

  test("uses interaction.client when the command client has no guild cache", async () => {
    const status = new Status({ logger: silentLogger() });
    const replies = [];

    await status.execute({
      client: statusClient({ serverCount: 5 }),
      reply: async (payload) => replies.push(payload),
    });

    expect(Status.resolveStatusClient({ logger: silentLogger() }, {
      client: statusClient({ serverCount: 5 }),
    }).guilds.cache.size).toBe(5);
    expect(replies[0].content).toContain("Servers: 5");
  });
});
