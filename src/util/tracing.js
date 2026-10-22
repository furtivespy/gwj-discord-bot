const DEFAULT_SERVICE_NAME = "stancy-bot";
const SHUTDOWN_INSTALLED = Symbol.for("stancy.tracingShutdown");
const SERVICE_NAME_ATTR = "service.name";

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

let sdk = null;
let flushPromise = null;
let warnedDisabled = false;

function createServiceResource(serviceName) {
  try {
    const resources = require("@opentelemetry/resources");
    if (typeof resources.resourceFromAttributes === "function") {
      return resources.resourceFromAttributes({ [SERVICE_NAME_ATTR]: serviceName });
    }
    if (typeof resources.Resource === "function") {
      return new resources.Resource({ [SERVICE_NAME_ATTR]: serviceName });
    }
  } catch {
    // Resource is optional; serviceName + OTEL_SERVICE_NAME still apply.
  }
  return undefined;
}

function applyServiceName(serviceName, env = process.env) {
  const assignIfBlank = (target) => {
    if (!target || typeof target !== "object") return;
    const current = typeof target.OTEL_SERVICE_NAME === "string"
      ? target.OTEL_SERVICE_NAME.trim()
      : "";
    if (!current) target.OTEL_SERVICE_NAME = serviceName;
  };
  assignIfBlank(env);
  if (env !== process.env) assignIfBlank(process.env);
}

function loadSdkDeps(deps = {}) {
  const sdkNode = deps.NodeSDK ? null : require("@opentelemetry/sdk-node");
  const exporter = deps.OTLPTraceExporter
    ? null
    : require("@opentelemetry/exporter-trace-otlp-http");
  const traceBase = deps.BatchSpanProcessor && deps.SimpleSpanProcessor && deps.ConsoleSpanExporter
    ? null
    : require("@opentelemetry/sdk-trace-base");
  const auto = deps.getNodeAutoInstrumentations
    ? null
    : require("@opentelemetry/auto-instrumentations-node");
  const api = deps.trace && deps.SpanStatusCode ? null : require("@opentelemetry/api");

  return {
    NodeSDK: deps.NodeSDK || sdkNode.NodeSDK,
    OTLPTraceExporter: deps.OTLPTraceExporter || exporter.OTLPTraceExporter,
    BatchSpanProcessor: deps.BatchSpanProcessor || traceBase.BatchSpanProcessor,
    SimpleSpanProcessor: deps.SimpleSpanProcessor || traceBase.SimpleSpanProcessor,
    ConsoleSpanExporter: deps.ConsoleSpanExporter || traceBase.ConsoleSpanExporter,
    getNodeAutoInstrumentations:
      deps.getNodeAutoInstrumentations || auto.getNodeAutoInstrumentations,
    trace: deps.trace || api.trace,
    SpanStatusCode: deps.SpanStatusCode || api.SpanStatusCode,
  };
}

function startTracing(env = process.env, deps = {}) {
  if (sdk) {
    return { enabled: true, reused: true };
  }

  const config = resolveTracingConfig(env);
  if (!config) {
    // Do not latch "started" here. A later call with an endpoint must still
    // be able to construct and start the SDK.
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.warn(
        "[tracing] OTEL_EXPORTER_OTLP_ENDPOINT not set — OpenTelemetry tracing disabled"
      );
    }
    return { enabled: false };
  }

  const {
    NodeSDK,
    OTLPTraceExporter,
    BatchSpanProcessor,
    SimpleSpanProcessor,
    ConsoleSpanExporter,
    getNodeAutoInstrumentations,
    trace,
    SpanStatusCode,
  } = loadSdkDeps(deps);

  applyServiceName(config.serviceName, env);

  const otlpExporter = new OTLPTraceExporter({
    url: config.endpoint,
    headers: config.headers,
  });

  const spanProcessors = [new BatchSpanProcessor(otlpExporter)];

  if (config.debugSpans) {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    console.log("[tracing] OTEL_DEBUG_SPANS=true — spans will print to console");
  }

  const sdkOptions = {
    serviceName: config.serviceName,
    spanProcessors,
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-http": { enabled: true },
        "@opentelemetry/instrumentation-undici": { enabled: true },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  };

  const resource = deps.resource !== undefined
    ? deps.resource
    : createServiceResource(config.serviceName);
  if (resource) sdkOptions.resource = resource;

  sdk = new NodeSDK(sdkOptions);
  sdk.start();
  flushPromise = null;
  if (deps.patchDiscordRest !== false) {
    patchDiscordRest(trace, SpanStatusCode);
  }
  console.log(
    `[tracing] OTel started — service=${config.serviceName} → ${config.endpoint}`
  );
  return { enabled: true, config, sdkOptions };
}

function patchDiscordRest(trace, SpanStatusCode) {
  try {
    const { REST } = require("@discordjs/rest");
    const discordRestTracer = trace.getTracer("stancy-bot:rest");
    const originalQueueRequest = REST.prototype.queueRequest;
    REST.prototype.queueRequest = async function patchedQueueRequest(options = {}) {
      const method = options.method ?? "UNKNOWN";
      const fullRoute = options.fullRoute;
      const routeData =
        typeof REST.generateRouteData === "function" && fullRoute
          ? REST.generateRouteData(fullRoute, method)
          : {};
      const route = routeData.bucketRoute ?? fullRoute ?? "unknown";

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
  await active.shutdown();
}

function flushTracing(timeoutMs = 5000) {
  if (!flushPromise) {
    flushPromise = Promise.resolve()
      .then(() => shutdownTracing())
      .catch((err) => {
        console.error("[tracing] shutdown failed:", err);
      });
  }
  if (!timeoutMs) return flushPromise;
  return Promise.race([
    flushPromise,
    new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      if (typeof timer.unref === "function") timer.unref();
    }),
  ]);
}

function registerTracingShutdown({
  processRef = process,
  timeoutMs = 5000,
} = {}) {
  if (processRef[SHUTDOWN_INSTALLED]) {
    return processRef[SHUTDOWN_INSTALLED];
  }

  const originalExit = typeof processRef.exit === "function"
    ? processRef.exit.bind(processRef)
    : null;

  const installed = {
    onSignal: null,
    originalExit,
    exiting: false,
  };

  const onSignal = async () => {
    await flushTracing(timeoutMs);
    // Game Bot does sdk.shutdown().finally(() => process.exit(0)), which
    // races FUR-111's gracefulShutdown store close. Flush here and only
    // exit ourselves when nothing else has already called process.exit.
    if (!installed.exiting && originalExit) {
      installed.exiting = true;
      originalExit(0);
    }
  };

  installed.onSignal = onSignal;
  processRef.on("SIGTERM", onSignal);
  processRef.on("SIGINT", onSignal);

  if (originalExit) {
    processRef.exit = (code) => {
      if (installed.exiting) {
        return originalExit(code);
      }
      if (!sdk && !flushPromise) {
        installed.exiting = true;
        return originalExit(code);
      }
      installed.exiting = true;
      // Other shutdown handlers (close stores, destroy the client) may call
      // process.exit synchronously. Wait for the OTLP flush first so we do
      // not drop the last batch, then exit with their code.
      flushTracing(timeoutMs).finally(() => originalExit(code ?? 0));
    };
  }

  processRef[SHUTDOWN_INSTALLED] = installed;
  return installed;
}

module.exports = {
  DEFAULT_SERVICE_NAME,
  SERVICE_NAME_ATTR,
  parseOtelHeaders,
  resolveTracingConfig,
  startTracing,
  shutdownTracing,
  registerTracingShutdown,
};
