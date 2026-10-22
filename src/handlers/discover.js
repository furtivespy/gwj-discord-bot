const fs = require("fs");
const path = require("path");

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

function instantiate(Exported, client) {
  if (typeof Exported === "function") {
    return new Exported(client);
  }
  return Exported;
}

module.exports = { listJsFiles, instantiate };
