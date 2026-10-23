import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  CONTAINER_DATA_DIR,
  isInContainer,
  resolveDataDir,
  resolveConfigPath,
} from "../src/db/dataDir.js";

describe("isInContainer", () => {
  test("is false when unset (local runs)", () => {
    expect(isInContainer({})).toBe(false);
  });

  test('is true only for the exact string "true"', () => {
    expect(isInContainer({ IS_IN_CONTAINER: "true" })).toBe(true);
    expect(isInContainer({ IS_IN_CONTAINER: "1" })).toBe(false);
    expect(isInContainer({ IS_IN_CONTAINER: "True" })).toBe(false);
  });
});

describe("resolveDataDir", () => {
  test("uses the mounted /data path in a container", () => {
    expect(
      resolveDataDir({
        IS_IN_CONTAINER: "true",
        STANCY_DATA_DIR: "/tmp/should-not-win",
      })
    ).toBe(CONTAINER_DATA_DIR);
  });

  test("uses STANCY_DATA_DIR when running locally", () => {
    expect(resolveDataDir({ STANCY_DATA_DIR: "/tmp/stancy-data" })).toBe(
      path.resolve("/tmp/stancy-data")
    );
  });

  test("defaults to ./data when running locally without STANCY_DATA_DIR", () => {
    expect(resolveDataDir({})).toBe(path.resolve("./data"));
  });
});

describe("resolveConfigPath", () => {
  test("prefers BOT_CONFIG when set", () => {
    expect(
      resolveConfigPath({
        BOT_CONFIG: "/custom/config.json",
        IS_IN_CONTAINER: "true",
      })
    ).toBe("/custom/config.json");
  });

  test("uses /data/config.json in a container", () => {
    expect(resolveConfigPath({ IS_IN_CONTAINER: "true" })).toBe(
      path.join(CONTAINER_DATA_DIR, "config.json")
    );
  });

  test("uses ./config.json when running locally", () => {
    expect(resolveConfigPath({})).toBe("./config.json");
  });
});
