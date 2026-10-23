import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsFiles(full));
    } else if (entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files.sort();
}

function exportedValue(mod) {
  if (mod && typeof mod === "object" && "default" in mod && mod.default !== undefined) {
    return mod.default;
  }
  return mod;
}

function instantiate(mod, client) {
  const Exported = exportedValue(mod);
  if (typeof Exported === "function") {
    return new Exported(client);
  }
  return Exported;
}

async function importJsFile(file) {
  return import(pathToFileURL(file).href);
}

export { listJsFiles, exportedValue, instantiate, importJsFile };
