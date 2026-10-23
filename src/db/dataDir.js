import fs from "node:fs";
import path from "node:path";

const CONTAINER_DATA_DIR = "/data";
const LOCAL_CONFIG_PATH = "./config.json";

function isInContainer(env = process.env) {
  return env.IS_IN_CONTAINER === "true";
}

function resolveDataDir(env = process.env) {
  if (isInContainer(env)) {
    return CONTAINER_DATA_DIR;
  }
  if (env.STANCY_DATA_DIR) {
    return path.resolve(env.STANCY_DATA_DIR);
  }
  return path.resolve("./data");
}

function resolveConfigPath(env = process.env) {
  if (env.BOT_CONFIG) {
    return env.BOT_CONFIG;
  }
  if (isInContainer(env)) {
    return path.join(CONTAINER_DATA_DIR, "config.json");
  }
  return LOCAL_CONFIG_PATH;
}

function ensureDataDir(env = process.env) {
  const dataDir = resolveDataDir(env);
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export {
  CONTAINER_DATA_DIR,
  isInContainer,
  resolveDataDir,
  resolveConfigPath,
  ensureDataDir,
};
