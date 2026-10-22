import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SERVICE_NAME,
  parseOtelHeaders,
  resolveTracingConfig,
  startTracing,
} from "../src/util/tracing.js";

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
  });
});
