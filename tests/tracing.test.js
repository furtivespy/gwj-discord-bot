import { afterEach, describe, expect, test } from "bun:test";
import fs from "fs";
import path from "path";
import {
  DEFAULT_SERVICE_NAME,
  SERVICE_NAME_ATTR,
  parseOtelHeaders,
  resolveTracingConfig,
  shutdownTracing,
  startTracing,
} from "../src/util/tracing.js";

const originalServiceName = process.env.OTEL_SERVICE_NAME;

function restoreServiceName() {
  if (originalServiceName === undefined) {
    delete process.env.OTEL_SERVICE_NAME;
  } else {
    process.env.OTEL_SERVICE_NAME = originalServiceName;
  }
}

function fakeTracingDeps({ slowShutdown = false } = {}) {
  const constructed = [];
  const instances = [];
  const exporters = [];

  class NodeSDK {
    constructor(options) {
      constructed.push(options);
      instances.push(this);
      this.options = options;
      this.started = false;
      this.shutDown = false;
      this.releaseShutdown = null;
    }

    start() {
      this.started = true;
    }

    async shutdown() {
      if (slowShutdown) {
        await new Promise((resolve) => {
          this.releaseShutdown = resolve;
        });
      }
      this.shutDown = true;
    }
  }

  class OTLPTraceExporter {
    constructor(options) {
      exporters.push(options);
      this.options = options;
    }
  }

  class BatchSpanProcessor {
    constructor(exporter) {
      this.exporter = exporter;
    }
  }

  class SimpleSpanProcessor {
    constructor(exporter) {
      this.exporter = exporter;
    }
  }

  class ConsoleSpanExporter {}

  return {
    constructed,
    instances,
    exporters,
    NodeSDK,
    OTLPTraceExporter,
    BatchSpanProcessor,
    SimpleSpanProcessor,
    ConsoleSpanExporter,
    getNodeAutoInstrumentations: () => [],
    trace: { getTracer() { return {}; } },
    SpanStatusCode: { ERROR: 2 },
    patchDiscordRest: false,
    resource: { attributes: { [SERVICE_NAME_ATTR]: DEFAULT_SERVICE_NAME } },
  };
}

describe("OpenTelemetry config", () => {
  test("stays off unless an OTLP endpoint is set", () => {
    expect(resolveTracingConfig({})).toBeNull();
    expect(resolveTracingConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "   " })).toBeNull();
    expect(
      resolveTracingConfig({
        OTEL_SERVICE_NAME: "stancy-bot",
        HONEYCOMB_API_KEY: "not-enough",
      })
    ).toBeNull();
    expect(startTracing({})).toEqual({ enabled: false });
    expect(startTracing({})).toEqual({ enabled: false });
  });

  test("enables when OTEL_EXPORTER_OTLP_ENDPOINT is set", () => {
    expect(
      resolveTracingConfig({
        OTEL_EXPORTER_OTLP_ENDPOINT: " https://otel.example/v1/traces ",
        OTEL_SERVICE_NAME: " ",
        OTEL_EXPORTER_OTLP_HEADERS: "x-honeycomb-team=abc, authorization=Bearer z",
        OTEL_DEBUG_SPANS: "true",
      })
    ).toEqual({
      endpoint: "https://otel.example/v1/traces",
      serviceName: DEFAULT_SERVICE_NAME,
      headers: {
        "x-honeycomb-team": "abc",
        authorization: "Bearer z",
      },
      debugSpans: true,
    });
  });

  test("parses comma-separated OTLP headers", () => {
    expect(parseOtelHeaders("")).toEqual({});
    expect(parseOtelHeaders("no-equals")).toEqual({});
    expect(parseOtelHeaders("a=1,b=2")).toEqual({ a: "1", b: "2" });
    expect(parseOtelHeaders("Authorization=Bearer a,b")).toEqual({
      Authorization: "Bearer a,b",
    });
  });
});

describe("startTracing", () => {
  afterEach(async () => {
    await shutdownTracing();
    restoreServiceName();
  });

  test("does not construct or start the SDK when the endpoint is missing or blank", () => {
    const missing = fakeTracingDeps();
    const blank = fakeTracingDeps();

    expect(startTracing({}, missing)).toEqual({ enabled: false });
    expect(startTracing({ OTEL_EXPORTER_OTLP_ENDPOINT: "   " }, blank)).toEqual({
      enabled: false,
    });
    expect(missing.constructed).toEqual([]);
    expect(blank.constructed).toEqual([]);
    expect(missing.instances).toEqual([]);
    expect(blank.instances).toEqual([]);
  });

  test("being disabled does not block a later enable", async () => {
    const deps = fakeTracingDeps();
    expect(startTracing({}, deps).enabled).toBe(false);
    expect(deps.constructed).toEqual([]);

    const enabled = startTracing(
      { OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example/v1/traces" },
      deps
    );

    expect(enabled.enabled).toBe(true);
    expect(enabled.reused).toBeUndefined();
    expect(deps.constructed).toHaveLength(1);
    expect(deps.instances[0].started).toBe(true);
    expect(deps.constructed[0].serviceName).toBe(DEFAULT_SERVICE_NAME);
    expect(deps.constructed[0].resource).toEqual(deps.resource);
  });

  test("passes the default service name into NodeSDK and OTEL_SERVICE_NAME", () => {
    delete process.env.OTEL_SERVICE_NAME;
    const deps = fakeTracingDeps();
    const env = { OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example/v1/traces" };

    const result = startTracing(env, deps);

    expect(result.enabled).toBe(true);
    expect(env.OTEL_SERVICE_NAME).toBe(DEFAULT_SERVICE_NAME);
    expect(process.env.OTEL_SERVICE_NAME).toBe(DEFAULT_SERVICE_NAME);
    expect(deps.constructed[0].serviceName).toBe(DEFAULT_SERVICE_NAME);
  });
});

describe("production shutdown ownership", () => {
  test("tracing.js does not export a signal helper; bot.js only starts the SDK", () => {
    const tracing = require("../src/util/tracing.js");
    const botSrc = fs.readFileSync(path.join(import.meta.dir, "../src/bot.js"), "utf8");
    expect(tracing.registerTracingShutdown).toBeUndefined();
    expect(botSrc).toMatch(/startTracing\s*\(/);
    expect(botSrc).not.toMatch(/registerTracingShutdown/);
    expect(botSrc).toMatch(/registerShutdownHandlers/);
  });
});
