const DEFAULT_SERVICE_NAME = "stancy-bot";

function parseOtelHeaders(raw) {
  if (!raw || typeof raw !== "string") return {};
  const headers = {};
  for (const part of raw.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) headers[key] = value;
  }
  return headers;
}

function resolveTracingConfig(env = process.env) {
  const endpoint = typeof env.OTEL_EXPORTER_OTLP_ENDPOINT === "string"
    ? env.OTEL_EXPORTER_OTLP_ENDPOINT.trim()
    : "";
  if (!endpoint) return null;

  const serviceName = typeof env.OTEL_SERVICE_NAME === "string"
    ? env.OTEL_SERVICE_NAME.trim()
    : "";

  return {
    endpoint,
    serviceName: serviceName || DEFAULT_SERVICE_NAME,
    headers: parseOtelHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    debugSpans: env.OTEL_DEBUG_SPANS === "true",
  };
}

let started = false;
let sdk = null;

function isTracingEnabled(env = process.env) {
  return resolveTracingConfig(env) !== null;
}

function startTracing(env = process.env) {
  if (started) {
    return { enabled: Boolean(sdk), reused: true };
  }

  const config = resolveTracingConfig(env);
  if (!config) {
    started = true;
    console.warn(
      "[tracing] OTEL_EXPORTER_OTLP_ENDPOINT not set — OpenTelemetry tracing disabled"
    );
    return { enabled: false };
  }

  const { NodeSDK } = require("@opentelemetry/sdk-node");
  const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
  const {
    ConsoleSpanExporter,
    SimpleSpanProcessor,
    BatchSpanProcessor,
  } = require("@opentelemetry/sdk-trace-base");
  const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
  const { trace, SpanStatusCode } = require("@opentelemetry/api");

  const otlpExporter = new OTLPTraceExporter({
    url: config.endpoint,
    headers: config.headers,
  });

  const spanProcessors = [new BatchSpanProcessor(otlpExporter)];

  if (config.debugSpans) {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    console.log("[tracing] OTEL_DEBUG_SPANS=true — spans will print to console");
  }

  sdk = new NodeSDK({
    spanProcessors,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-http": { enabled: true },
        "@opentelemetry/instrumentation-undici": { enabled: true },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });

  sdk.start();
  started = true;
  patchDiscordRest(trace, SpanStatusCode);
  console.log(
    `[tracing] OTel started — service=${config.serviceName} → ${config.endpoint}`
  );
  return { enabled: true, config };
}

function patchDiscordRest(trace, SpanStatusCode) {
  try {
    const { REST } = require("@discordjs/rest");
    const discordRestTracer = trace.getTracer("stancy-bot:rest");
    const originalQueueRequest = REST.prototype.queueRequest;
    REST.prototype.queueRequest = async function patchedQueueRequest(options) {
      const method = options.method ?? "UNKNOWN";
      const routeData = REST.generateRouteData(options.fullRoute, method);
      const route = routeData.bucketRoute ?? options.fullRoute ?? "unknown";

      if (method === "GET" && route === "/applications/@me") {
        return originalQueueRequest.apply(this, arguments);
      }

      return discordRestTracer.startActiveSpan(
        `discord.rest ${method} ${route}`,
        async (span) => {
          span.setAttributes({
            "discord.rest.method": method,
            "discord.rest.route": route,
          });
          try {
            return await originalQueueRequest.apply(this, arguments);
          } catch (err) {
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            throw err;
          } finally {
            span.end();
          }
        }
      );
    };
    console.log("[tracing] Discord REST patched");
  } catch (err) {
    console.warn("[tracing] Could not patch @discordjs/rest:", err.message);
  }
}

async function shutdownTracing() {
  if (!sdk) return;
  const active = sdk;
  sdk = null;
  started = false;
  await active.shutdown();
}

module.exports = {
  DEFAULT_SERVICE_NAME,
  isTracingEnabled,
  parseOtelHeaders,
  resolveTracingConfig,
  startTracing,
  shutdownTracing,
};
