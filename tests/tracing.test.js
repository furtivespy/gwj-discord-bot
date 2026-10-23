import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
} from "@opentelemetry/sdk-trace";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import * as tracing from "../src/util/tracing.js";
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

function fakeTracingDeps({ slowShutdown = false, patchDiscordRest = false } = {}) {
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
    patchDiscordRest,
    resource: { attributes: { [SERVICE_NAME_ATTR]: DEFAULT_SERVICE_NAME } },
  };
}

describe("OpenTelemetry config", () => {
  test("stays off unless an OTLP endpoint is set", async () => {
    expect(resolveTracingConfig({})).toBeNull();
    expect(resolveTracingConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: "   " })).toBeNull();
    expect(
      resolveTracingConfig({
        OTEL_SERVICE_NAME: "stancy-bot",
        HONEYCOMB_API_KEY: "not-enough",
      })
    ).toBeNull();
    expect(await startTracing({})).toEqual({ enabled: false });
    expect(await startTracing({})).toEqual({ enabled: false });
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

  test("does not construct or start the SDK when the endpoint is missing or blank", async () => {
    const missing = fakeTracingDeps();
    const blank = fakeTracingDeps();

    expect(await startTracing({}, missing)).toEqual({ enabled: false });
    expect(await startTracing({ OTEL_EXPORTER_OTLP_ENDPOINT: "   " }, blank)).toEqual({
      enabled: false,
    });
    expect(missing.constructed).toEqual([]);
    expect(blank.constructed).toEqual([]);
    expect(missing.instances).toEqual([]);
    expect(blank.instances).toEqual([]);
  });

  test("being disabled does not block a later enable", async () => {
    const deps = fakeTracingDeps();
    expect((await startTracing({}, deps)).enabled).toBe(false);
    expect(deps.constructed).toEqual([]);

    const enabled = await startTracing(
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

  test("passes the default service name into NodeSDK and OTEL_SERVICE_NAME", async () => {
    delete process.env.OTEL_SERVICE_NAME;
    const deps = fakeTracingDeps();
    const env = { OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example/v1/traces" };

    const result = await startTracing(env, deps);

    expect(result.enabled).toBe(true);
    expect(env.OTEL_SERVICE_NAME).toBe(DEFAULT_SERVICE_NAME);
    expect(process.env.OTEL_SERVICE_NAME).toBe(DEFAULT_SERVICE_NAME);
    expect(deps.constructed[0].serviceName).toBe(DEFAULT_SERVICE_NAME);
  });
});

describe("real OpenTelemetry packages", () => {
  test("0.300 / sdk-trace still export the constructors tracing.js uses", () => {
    expect(typeof NodeSDK).toBe("function");
    expect(typeof OTLPTraceExporter).toBe("function");
    expect(typeof BatchSpanProcessor).toBe("function");
    expect(typeof SimpleSpanProcessor).toBe("function");
    expect(typeof ConsoleSpanExporter).toBe("function");
    expect(typeof getNodeAutoInstrumentations).toBe("function");
    expect(trace).toBeDefined();
    expect(SpanStatusCode).toBeDefined();
    expect(typeof resourceFromAttributes).toBe("function");

    const exporter = new OTLPTraceExporter({
      url: "http://127.0.0.1:4318/v1/traces",
    });
    expect(() => new BatchSpanProcessor({ exporter })).not.toThrow();
    expect(() => new SimpleSpanProcessor({
      exporter: new ConsoleSpanExporter(),
    })).not.toThrow();
  });
});

describe("Discord REST patch", () => {
  afterEach(async () => {
    await shutdownTracing();
    restoreServiceName();
  });

  test("patches the REST prototype discord.js Client uses, not the ESM @discordjs/rest export", async () => {
    const { Client, REST } = await import("discord.js");
    const esm = await import("@discordjs/rest");
    const originalQueueRequest = REST.prototype.queueRequest;
    const originalEsmQueueRequest = esm.REST.prototype.queueRequest;
    const deps = fakeTracingDeps({ patchDiscordRest: true });

    try {
      const result = await startTracing(
        { OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example/v1/traces" },
        deps
      );
      expect(result.enabled).toBe(true);

      const client = new Client({ intents: [] });
      expect(Object.getPrototypeOf(client.rest)).toBe(REST.prototype);
      expect(client.rest.constructor).toBe(REST);
      expect(REST.prototype.queueRequest).not.toBe(originalQueueRequest);
      expect(REST.prototype.queueRequest.name).toBe("patchedQueueRequest");
      expect(client.rest.queueRequest).toBe(REST.prototype.queueRequest);

      // Dual-package hazard: ESM @discordjs/rest is a different class.
      expect(esm.REST).not.toBe(REST);
      expect(Object.getPrototypeOf(client.rest)).not.toBe(esm.REST.prototype);
      expect(esm.REST.prototype.queueRequest).toBe(originalEsmQueueRequest);
    } finally {
      REST.prototype.queueRequest = originalQueueRequest;
      esm.REST.prototype.queueRequest = originalEsmQueueRequest;
    }
  });
});

describe("production shutdown ownership", () => {
  test("tracing.js does not export a signal helper; bot.js only starts the SDK", () => {
    const botSrc = fs.readFileSync(path.join(import.meta.dir, "../src/bot.js"), "utf8");
    expect(tracing.registerTracingShutdown).toBeUndefined();
    expect(botSrc).toMatch(/startTracing\s*\(/);
    expect(botSrc).not.toMatch(/registerTracingShutdown/);
    expect(botSrc).toMatch(/registerShutdownHandlers/);
  });
});
