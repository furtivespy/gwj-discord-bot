import path from "node:path";
import { fileURLToPath } from "node:url";
import { Collection } from "discord.js";
import { listJsFiles, instantiate, importJsFile } from "./discover.js";

const DEFAULT_EVENTS_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "../events");

async function handleWithCatch(event, client, ...eventParams) {
  try {
    if (typeof event.run === "function") {
      return await event.run(...eventParams);
    }
    return await event(client, ...eventParams);
  } catch (error) {
    client.logger?.error(error, "events.js");
  }
}

function bindEvent(botClient, event) {
  const eventName = event.help?.eventType || event.help?.name;
  if (!eventName) {
    throw new Error("Event is missing help.eventType");
  }
  const bind = event.conf?.once ? "once" : "on";
  botClient[bind](eventName, (...params) =>
    Promise.resolve(handleWithCatch(event, botClient, ...params)).catch((error) => {
      botClient.logger?.error(error, "events.js");
    })
  );
  return eventName;
}

async function loadEvents(botClient, options = {}) {
  botClient.logger?.info("Loading Event Handlers", "events.js");
  if (!botClient.events) {
    botClient.events = new Collection();
  }

  const eventPath = options.eventsPath || DEFAULT_EVENTS_PATH;
  const loaded = [];

  for (const file of listJsFiles(eventPath)) {
    try {
      const event = instantiate(await importJsFile(file), botClient);
      const name = event.help?.name || path.basename(file, ".js");
      botClient.logger?.info(`Loading Event: ${name}. 👌`, "events.js");
      if (event.conf && event.conf.enabled === false) continue;
      const eventName = bindEvent(botClient, event);
      botClient.events.set(name, event);
      loaded.push({ name, eventName, event });
    } catch (err) {
      botClient.logger?.error(err, "events.js");
    }
  }

  return loaded;
}

loadEvents.handleWithCatch = handleWithCatch;

export { handleWithCatch, bindEvent, loadEvents };
export default loadEvents;
