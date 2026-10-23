const DEFAULT_SERVICE_NAME = "stancy-bot";
const SERVICE_NAME_ATTR = "service.name";

function parseOtelHeaders(raw) {
  if (!raw || typeof raw !== "string") return {};
  const headers = {};
  // Split only on commas that start another key=value pair so values may contain commas.
  for (const part of raw.split(/,(?=\s*[^,=]+=)/)) {
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
let warnedDisabled = false;

async function createServiceResource(serviceName) {
  try {
    const resources = await import("@opentelemetry/resources");
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

async function loadSdkDeps(deps = {}) {
  const sdkNode = deps.NodeSDK ? null : await import("@opentelemetry/sdk-node");
  const exporter = deps.OTLPTraceExporter
    ? null
    : await import("@opentelemetry/exporter-trace-otlp-http");
  const traceBase = deps.BatchSpanProcessor && deps.SimpleSpanProcessor && deps.ConsoleSpanExporter
    ? null
    : await import("@opentelemetry/sdk-trace");
  const auto = deps.getNodeAutoInstrumentations
    ? null
    : await import("@opentelemetry/auto-instrumentations-node");
  const api = deps.trace && deps.SpanStatusCode ? null : await import("@opentelemetry/api");

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

async function startTracing(env = process.env, deps = {}) {
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

  try {
    const {
      NodeSDK,
      OTLPTraceExporter,
      BatchSpanProcessor,
      SimpleSpanProcessor,
      ConsoleSpanExporter,
      getNodeAutoInstrumentations,
      trace,
      SpanStatusCode,
    } = await loadSdkDeps(deps);

    applyServiceName(config.serviceName, env);

    const otlpExporter = new OTLPTraceExporter({
      url: config.endpoint,
      headers: config.headers,
    });

    const spanProcessors = [new BatchSpanProcessor({ exporter: otlpExporter })];

    if (config.debugSpans) {
      spanProcessors.push(new SimpleSpanProcessor({
        exporter: new ConsoleSpanExporter(),
      }));
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
      : await createServiceResource(config.serviceName);
    if (resource) sdkOptions.resource = resource;

    sdk = new NodeSDK(sdkOptions);
    sdk.start();
    if (deps.patchDiscordRest !== false) {
      await patchDiscordRest(trace, SpanStatusCode);
    }
    console.log(
      `[tracing] OTel started — service=${config.serviceName} → ${config.endpoint}`
    );
    return { enabled: true, config, sdkOptions };
  } catch (err) {
    sdk = null;
    console.warn("[tracing] failed to start — continuing without traces:", err);
    return { enabled: false, error: err };
  }
}

async function patchDiscordRest(trace, SpanStatusCode) {
  try {
    // discord.js require()s the CJS build of @discordjs/rest. Dynamic
    // import("@discordjs/rest") is a different REST class than Client uses.
    const { REST } = await import("discord.js");
    const discordRestTracer = trace.getTracer("stancy-bot:rest");
    const originalQueueRequest = REST.prototype.queueRequest;
    REST.prototype.queueRequest = async function patchedQueueRequest(options) {
      const request = options ?? {};
      const method = request.method ?? "UNKNOWN";
      const fullRoute = request.fullRoute;
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
    console.warn("[tracing] Could not patch discord.js REST:", err.message);
  }
}

async function shutdownTracing() {
  if (!sdk) return;
  const active = sdk;
  sdk = null;
  await active.shutdown();
}

export {
  DEFAULT_SERVICE_NAME,
  SERVICE_NAME_ATTR,
  parseOtelHeaders,
  resolveTracingConfig,
  startTracing,
  shutdownTracing,
};
