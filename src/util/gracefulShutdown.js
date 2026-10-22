const { shutdownTracing } = require("./tracing");

const STORE_KEYS = ["settings"];

function collectStores(client) {
  const stores = [];
  if (Array.isArray(client?.dataStores)) {
    stores.push(...client.dataStores);
  }
  for (const key of STORE_KEYS) {
    const store = client?.[key];
    if (store && !stores.includes(store)) {
      stores.push(store);
    }
  }
  return stores;
}

function closeStores(client) {
  const closed = [];
  for (const store of collectStores(client)) {
    try {
      if (typeof store.close === "function") {
        store.close();
      } else {
        store.db?.close();
      }
      closed.push(store);
    } catch (error) {
      console.error("Error closing databases on shutdown:", error);
    }
  }
  return closed;
}

async function gracefulShutdown(
  client,
  signal,
  { exit = process.exit, flushTracing = shutdownTracing } = {}
) {
  const line = `Received ${signal}, shutting down…`;
  if (typeof client?.logger?.warn === "function") {
    client.logger.warn(line, "gracefulShutdown");
  } else if (typeof client?.logger?.log === "function") {
    client.logger.log(line, "warn");
  } else {
    console.warn(line);
  }
  closeStores(client);
  try {
    if (typeof flushTracing === "function") {
      await flushTracing();
    }
  } catch (error) {
    console.error("[tracing] shutdown failed:", error);
  }
  exit(0);
}

function registerShutdownHandlers(client, { processRef = process } = {}) {
  const handler = (signal) => gracefulShutdown(client, signal);
  processRef.on("SIGTERM", handler);
  processRef.on("SIGINT", handler);
  return handler;
}

module.exports = {
  STORE_KEYS,
  collectStores,
  closeStores,
  gracefulShutdown,
  registerShutdownHandlers,
};
