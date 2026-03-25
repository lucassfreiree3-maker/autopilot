import * as fs from "node:fs";
import * as path from "node:path";
import { Request, Response, NextFunction } from "express";
import { notifyTraceChanged } from "../services/logEvents.service";
import { tsSP } from "../util/logger";

const LOG_DIR =
  process.env.LOGS_DIR && process.env.LOGS_DIR.trim() !== ""
    ? path.resolve(process.cwd(), process.env.LOGS_DIR)
    : path.join(process.cwd(), "logs");
const TRACE_FILE = path.join(LOG_DIR, "automation-trace.log");
const MAX_ACCESS_FIELD_LEN = 300;

function clipField(value: unknown, fallback = "-"): string {
  let raw = "";
  if (typeof value === "string") {
    raw = value;
  } else if (value !== undefined) {
    raw = String(value);
  }
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, MAX_ACCESS_FIELD_LEN);
}

export function ensureLogsDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

export function accessLogger() {
  ensureLogsDir();

  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();

    const onFinish = () => {
      res.removeListener("close", onFinish);
      res.removeListener("finish", onFinish);

      const durNs = Number(process.hrtime.bigint() - start);
      const durationMs = Math.max(0, Math.round(durNs / 1_000_000));

      const ip =
        clipField(
          req.headers["x-forwarded-for"]?.toString().split(",")[0],
          "",
        ) || clipField(req.socket?.remoteAddress);

      const ua = clipField(req.headers["user-agent"] as string);

      const pathname =
        clipField(req.originalUrl, "") ||
        clipField(req.url, "") ||
        clipField((req as unknown as { path?: string }).path);

      const env = clipField(res.locals?.env as string);
      const reqId = clipField(res.locals?.requestId as string);
      const execId = clipField(res.locals?.execId as string);
      const method = clipField(req.method, "UNKNOWN");

      const isHealthEndpoint =
        pathname.startsWith("/health") || pathname.startsWith("/ready");

      if (isHealthEndpoint) {
        return;
      }

      const line =
        `[${tsSP()} BRT] ACCESS ` +
        `status=${res.statusCode} ` +
        `method=${method} ` +
        `path=${pathname} ` +
        `took=${durationMs}ms ` +
        `ip=${ip} ` +
        `ua=${JSON.stringify(ua)} ` +
        `env=${env} ` +
        `reqId=${reqId} ` +
        `execId=${execId}`;

      try {
        fs.appendFileSync(TRACE_FILE, `${line}\n`, { encoding: "utf8" });
      } catch {
        // Best-effort file logging; continue with stdout.
      }

      try {
        process.stdout.write(`${line}\n`);
      } catch {
        // Ignore stdout write failures.
      }
      notifyTraceChanged();
    };

    res.once("finish", onFinish);
    res.once("close", onFinish);

    next();
  };
}
