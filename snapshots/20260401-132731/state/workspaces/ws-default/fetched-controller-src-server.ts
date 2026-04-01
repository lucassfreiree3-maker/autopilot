import express, {
  type Request,
  type Response,
  type NextFunction,
  type ErrorRequestHandler,
} from "express";
import fs from "node:fs";
import path from "path";
import crypto from "crypto";
import swaggerUi from "swagger-ui-express";
import agentsRouter from "./routes/agentsRouter";
import logsRouter from "./routes/logs";
import authRouter from "./routes/auth";
import oasRouter from "./routes/oasRouter";
import { makeSwaggerDoc } from "./swagger/makeSwagger";
import { patchConsole } from "./util/logger";
import { accessLogger } from "./middleware/logging";
import {
  metricsRegistry,
  requestSeconds,
  responseSizeBytes,
} from "./util/metrics";

process.env.TZ = process.env.TZ || "America/Sao_Paulo";
patchConsole("server");

type Locals = {
  requestId?: string;
  startHrTime?: bigint;
  errorMessage?: string;
};

const SERVICE_NAME_FALLBACK = "psc-sre-automacao-controller";
const SERVICE_VERSION_FALLBACK = "0.0.0";
const SAFE_METADATA_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

type PackageMetadata = {
  name?: string;
  version?: string;
};

let packageMetadataCache: PackageMetadata | null = null;

function parseSafeMetadata(value: unknown): string {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed || !SAFE_METADATA_PATTERN.test(trimmed)) return "";

  return encodeURIComponent(trimmed);
}

function readPackageMetadata(): PackageMetadata {
  if (packageMetadataCache) return packageMetadataCache;

  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as PackageMetadata;
    packageMetadataCache = parsed && typeof parsed === "object" ? parsed : {};
    return packageMetadataCache;
  } catch {
    packageMetadataCache = {};
    return packageMetadataCache;
  }
}

function buildContentSecurityPolicy(req: Request): string {
  const isApiDocs =
    req.path.startsWith("/api-docs") ||
    req.path.startsWith("/swagger-helmfire") ||
    req.path.startsWith("/icons/");

  const scriptSrc = isApiDocs
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : "'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "img-src 'self' data: https:",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https:",
  ].join("; ");
}

export const app = express();

app.use((req: Request, res: Response, next: NextFunction) => {
  const traceparent = req.header("traceparent") || "";
  const traceMatch = traceparent.match(
    /^[\da-f]{2}-([\da-f]{32})-([\da-f]{16})-[\da-f]{2}$/i,
  );

  const requestId =
    traceMatch?.[2] ||
    req.header("X-Request-ID") ||
    crypto.randomUUID() ||
    crypto.randomUUID();

  res.setHeader("X-Request-ID", requestId);

  const locals = res.locals as Locals;
  locals.requestId = requestId;
  locals.startHrTime = process.hrtime.bigint();

  next();
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader("Content-Security-Policy", buildContentSecurityPolicy(req));
  next();
});

app.use(express.static(path.join(process.cwd(), "static")));

app.set("trust proxy", true);
app.use(accessLogger());

app.use((req: Request, res: Response, next: NextFunction) => {
  const locals = res.locals as Locals;

  const startHrTime = locals.startHrTime ?? process.hrtime.bigint();
  locals.startHrTime = startHrTime;

  res.on("finish", () => {
    try {
      const end = process.hrtime.bigint();
      const durationSeconds = Number(end - startHrTime) / 1e9;

      const { statusCode } = res;
      const pathLabel = req.route?.path ?? req.path ?? "unknown";
      const isError = statusCode >= 500;
      const errorMessage = locals.errorMessage ?? "";

      requestSeconds
        .labels({
          type: "http",
          status: String(statusCode),
          method: req.method,
          addr: pathLabel,
          isError: String(isError),
          errorMessage,
        })
        .observe(durationSeconds);

      const headerValue = res.getHeader("Content-Length");
      let contentLength = 0;

      if (typeof headerValue === "number") {
        contentLength = headerValue;
      } else if (typeof headerValue === "string") {
        const parsed = Number(headerValue);
        if (!Number.isNaN(parsed)) {
          contentLength = parsed;
        }
      }

      if (contentLength > 0) {
        responseSizeBytes
          .labels({
            type: "http",
            status: String(statusCode),
            method: req.method,
            addr: pathLabel,
            isError: String(isError),
            errorMessage,
          })
          .inc(contentLength);
      }
    } catch (error) {
      console.error("[metrics] failed to record metrics", error);
    }
  });

  next();
});

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(makeSwaggerDoc(), {
    customSiteTitle: "Helmfire | Ritmo | Automacao Controller (API Docs)",
    customfavIcon: "/icons/favicon-32x32.png",
    
    
    customCss: `
      .swagger-ui .filter-container,
      .swagger-ui .operation-filter-input,
      .swagger-ui input[placeholder="Filter by tag"] {
        display: none !important;
      }
    `,
    swaggerOptions: {
      filter: false,
      displayRequestDuration: true,
      persistAuthorization: true,
      deepLinking: true,
      docExpansion: "list",
      tryItOutEnabled: true,
      defaultModelRendering: "example",
      defaultModelsExpandDepth: -1,
    },
  }),
);

app.use("/auth", authRouter);

app.get("/", (_req: Request, res: Response) => {
  try {
    const packageMetadata = readPackageMetadata();
    const serviceName =
      parseSafeMetadata(
        process.env.SERVICE_NAME ||
          packageMetadata.name ||
          process.env.npm_package_name,
      ) || SERVICE_NAME_FALLBACK;
    const serviceVersion =
      parseSafeMetadata(
        packageMetadata.version ||
          process.env.npm_package_version ||
          process.env.PROJECT_VERSION,
      ) || SERVICE_VERSION_FALLBACK;

    res.status(200).json({
      ok: true,
      service: serviceName,
      version: serviceVersion,
      message: "Server online",
      endpoints: {
        health: "GET /health",
        ready: "GET /ready",
        metrics: "GET /metrics",
        swagger: "GET /api-docs",
        issueToken: "POST /auth/token",
        requiredScopes: "GET /auth/required-scopes",
        agentsList: "GET /agent/list",
        agentRegister: "POST /agent/register",
        agentInfo: "GET /agent/info",
        executePost: "POST /agent/execute",
        executeGet: "GET /agent/execute?uuid=<execId>",
        executeLogs: "POST /agent/execute/logs",
        agentErrors: "GET /agent/errors",
        rotateLogs: "GET /logs/rotate",
        oasSreController: "POST /oas/sre-controller",
        oasListAutomations: "GET /oas/automations",
        oasGetAutomation: "GET /oas/automations/{automation}",
        oasAutomations: "POST /oas/automations/{automation}",
      },
    });
  } catch {
    res.status(200).json({
      ok: true,
      message: "Server online",
    });
  }
});

app.get("/health", (_req: Request, res: Response) =>
  res.status(200).json({ status: "UP" }),
);

app.get("/ready", (_req: Request, res: Response) =>
  res.status(200).json({ status: "UP" }),
);

app.get("/metrics", async (_req: Request, res: Response) => {
  try {
    res.setHeader("Content-Type", metricsRegistry.contentType);
    const metrics = await metricsRegistry.metrics();
    res.status(200).send(metrics);
  } catch (error) {
    console.error("[metrics] unable to collect metrics", error);
    res.status(500).send("# error collecting metrics");
  }
});

app.use("/", agentsRouter);
app.use("/logs", logsRouter);
app.use("/oas", oasRouter);

type BodySyntaxError = SyntaxError & { body?: unknown };

function isBodySyntaxError(error: unknown): error is BodySyntaxError {
  return (
    error instanceof SyntaxError &&
    typeof (error as { body?: unknown }).body !== "undefined"
  );
}

const badJsonHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (!isBodySyntaxError(err)) return next(err);

  res.status(400).type("application/problem+json").json({
    type: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/400",
    title: "Bad Request",
    status: 400,
    detail: "Invalid JSON in request body.",
    instance: req.originalUrl,
  });
};

app.use(badJsonHandler);

export function startServer(port = Number(process.env.PORT || 3000)) {
  const server = app.listen(port, () => {
    console.log(`[server] running on http://localhost:${port}`);
  });
  return server;
}

if (require.main === module) {
  startServer();
}

process.on("uncaughtException", (error: unknown) => {
  console.error("[fatal] uncaughtException", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  console.error("[fatal] unhandledRejection", reason);
  process.exit(1);
});

