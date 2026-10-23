import path from "node:path";
import { Database } from "bun:sqlite";
import { ensureDataDir } from "./dataDir.js";

function cloneValue(value) {
  if (value === undefined) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function setPathValue(target, dotPath, value) {
  const parts = dotPath.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof node[part] !== "object" || node[part] === null) {
      node[part] = {};
    }
    node = node[part];
  }
  node[parts[parts.length - 1]] = value;
}

function deletePathValue(target, dotPath) {
  const parts = dotPath.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof node[part] !== "object" || node[part] === null) return;
    node = node[part];
  }
  delete node[parts[parts.length - 1]];
}

function parseStoredValue(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    throw new Error("empty enmap value");
  }
  const value = JSON.parse(rawValue);
  if (value === null || value === undefined) {
    throw new Error("null enmap value");
  }
  return value;
}

class BunEnmap {
  constructor(options = {}) {
    if (!options.name) {
      throw new Error("BunEnmap requires a 'name' option.");
    }

    this.name = options.name;
    this.cloneLevel = options.cloneLevel || "none";
    this.cache = new Map();

    const dataDir = options.dataDir || ensureDataDir();

    this.db = new Database(path.join(dataDir, `${this.name}.sqlite`), { create: true });
    this.db.exec(`PRAGMA journal_mode = WAL`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS enmap_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const rows = this.db.query("SELECT key, value FROM enmap_store").all();
    for (const row of rows) {
      try {
        this.cache.set(row.key, parseStoredValue(row.value));
      } catch {
        // Skip unreadable rows. Caching null would make ensure() skip repair.
        console.warn(`BunEnmap(${this.name}): skipping unparseable row ${row.key}`);
      }
    }
  }

  _normalizeKey(key) {
    return String(key);
  }

  _persist(key, value) {
    const stringKey = this._normalizeKey(key);
    this.db
      .query(
        "INSERT INTO enmap_store (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .run(stringKey, JSON.stringify(value));
  }

  _cloneIfNeeded(value) {
    if (this.cloneLevel === "deep") return cloneValue(value);
    return value;
  }

  get(key) {
    const value = this.cache.get(this._normalizeKey(key));
    return this._cloneIfNeeded(value);
  }

  set(key, value, pathKey) {
    const stringKey = this._normalizeKey(key);
    if (pathKey) {
      const base = this.get(stringKey) || {};
      setPathValue(base, pathKey, value);
      this._persist(stringKey, base);
      this.cache.set(stringKey, base);
      return this;
    }

    const stored = this._cloneIfNeeded(value);
    this._persist(stringKey, stored);
    this.cache.set(stringKey, stored);
    return this;
  }

  has(key) {
    return this.cache.has(this._normalizeKey(key));
  }

  ensure(key, defaultValue) {
    const stringKey = this._normalizeKey(key);
    if (!this.has(stringKey)) {
      const valueToSet =
        typeof defaultValue === "function" ? defaultValue() : cloneValue(defaultValue);
      this.set(stringKey, valueToSet);
    }
    return this.get(stringKey);
  }

  delete(key, pathKey) {
    const stringKey = this._normalizeKey(key);
    if (pathKey) {
      if (!this.has(stringKey)) return false;
      const base = this.get(stringKey) || {};
      deletePathValue(base, pathKey);
      this.cache.set(stringKey, base);
      this._persist(stringKey, base);
      return true;
    }

    const deleted = this.cache.delete(stringKey);
    if (deleted) {
      this.db.query("DELETE FROM enmap_store WHERE key = ?").run(stringKey);
    }
    return deleted;
  }

  runDiagnostic() {
    const testKey = "__diag__";
    const testVal = { _diag: true, ts: Date.now() };
    try {
      this.set(testKey, testVal);
      const readBack = this.get(testKey);
      const ok = readBack?._diag === true && readBack?.ts === testVal.ts;
      this.delete(testKey);
      return { cycleOk: ok, cycleError: null };
    } catch (e) {
      return { cycleOk: false, cycleError: e.message };
    }
  }

  filter(predicate) {
    const result = new Map();
    for (const [key, value] of this.cache.entries()) {
      if (predicate(value, key, this)) {
        result.set(key, this._cloneIfNeeded(value));
      }
    }
    return result;
  }

  keys() {
    return this.cache.keys();
  }

  values() {
    const values = [];
    for (const value of this.cache.values()) {
      values.push(this._cloneIfNeeded(value));
    }
    return values.values();
  }

  entries() {
    return this[Symbol.iterator]();
  }

  [Symbol.iterator]() {
    const entries = [];
    for (const [key, value] of this.cache.entries()) {
      entries.push([key, this._cloneIfNeeded(value)]);
    }
    return entries[Symbol.iterator]();
  }

  close() {
    try {
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch (error) {
      console.error(`WAL checkpoint failed for ${this.name}:`, error);
    }
    this.db.close();
  }
}

export default BunEnmap;
