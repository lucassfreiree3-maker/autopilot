import fs from "node:fs";
import path from "node:path";

const MAX_JSON_NODES = 400;
const MAX_JSON_OUTPUT = 4000;
const MAX_KV_KEYS = 60;
const MAX_STRING_VALUE = 500;
const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|set-cookie|token|secret|password|api[-_]?key)/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function tsSP(d = new Date()): string {
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return f.format(d).replace(",", "");
}

function safeJsonSnippet(x: unknown): string {
  let nodes = 0;
  const seen = new Set<unknown>();
  const replacer = (k: string, v: unknown): unknown => {
    nodes += 1;
    if (nodes > MAX_JSON_NODES) return "[Truncated]";

    if (isSensitiveKey(k)) return "[REDACTED]";

    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
    }

    if (typeof v === "string") return v.slice(0, MAX_STRING_VALUE);

    return v;
  };

  try {
    const out = JSON.stringify(x, replacer, 0) ?? "";
    if (out.length <= MAX_JSON_OUTPUT) return out;
    return `${out.slice(0, MAX_JSON_OUTPUT)}...[Truncated]`;
  } catch {
    return String(x).slice(0, MAX_JSON_OUTPUT);
  }
}

function toKv(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";

  const pairs: string[] = [];
  const keys = Object.keys(obj as Record<string, unknown>);

  for (let i = 0; i < MAX_KV_KEYS; i += 1) {
    const k = keys[i];
    if (k === undefined) break;
    const v = (obj as Record<string, unknown>)[k];

    // Removido "continue" (ESLint no-continue): usando guarda
    if (v !== undefined && v !== null) {
      if (isSensitiveKey(k)) {
        pairs.push(`${k}=[REDACTED]`);
      } else if (typeof v === "string") {
        const sv = v.slice(0, MAX_STRING_VALUE);
        pairs.push(/\s/.test(sv) ? `${k}="${sv}"` : `${k}=${sv}`);
      } else if (typeof v === "object") {
        pairs.push(`${k}="${safeJsonSnippet(v)}"`);
      } else {
        pairs.push(`${k}=${String(v)}`);
      }
    }
  }

  if (keys.length > MAX_KV_KEYS) {
    pairs.push(`truncatedKeys=${keys.length - MAX_KV_KEYS}`);
  }

  return pairs.join(" ");
}

const LOGS_DIR = process.env.LOGS_DIR || path.join(process.cwd(), "logs");
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
const TRACE_FILE = path.join(LOGS_DIR, "automation-trace.log");

function accessStdout(): boolean {
  const raw = String(process.env.ACCESS_STDOUT ?? "").toLowerCase();
  if (raw === "false" || raw === "0") return false;
  return true;
}
export const ACCESS_STDOUT = accessStdout();

export function appendTraceLine(
  ns: string,
  msg: string,
  extras?: Record<string, unknown>,
): void {
  const head = `[${tsSP()} BRT] ${ns} ${msg}`;
  const tail = extras ? ` ${toKv(extras)}` : "";
  const line = head + tail;
  fs.appendFileSync(TRACE_FILE, `${line}\n`, { encoding: "utf8" });
  if (ACCESS_STDOUT) {
    console.log(line);
  }
}

function humanLine(
  level: "LOG" | "INFO" | "WARN" | "ERROR",
  ns: string,
  msg: unknown,
  rest: unknown[],
): string {
  let head = "";
  let tail = "";

  if (typeof msg === "string") {
    try {
      const maybe = JSON.parse(msg);
      head = typeof maybe?.msg === "string" ? maybe.msg : msg;
      const copy = { ...(maybe || {}) } as Record<string, unknown>;
      delete copy.msg;
      delete copy.level;
      delete copy.ts;
      delete copy.ns;
      const kv = toKv(copy);
      if (kv) tail = ` ${kv}`;
    } catch {
      head = msg;
    }
  } else if (typeof msg === "object" && msg) {
    const m = (msg as Record<string, unknown>).msg;
    head = typeof m === "string" ? m : safeJsonSnippet(msg);
    const copy = { ...(msg as Record<string, unknown>) };
    delete copy.msg;
    const kv = toKv(copy);
    if (kv) tail = ` ${kv}`;
  } else {
    head = String(msg);
  }

  if (rest && rest.length > 0) {
    const merged: Record<string, unknown> = {};
    let mergedCount = 0;
    for (let i = 0; i < MAX_KV_KEYS; i += 1) {
      if (i >= rest.length) break;
      const r = rest[i];
      if (r && typeof r === "object") {
        const obj = r as Record<string, unknown>;
        const keys = Object.keys(obj);
        for (let j = 0; j < MAX_KV_KEYS; j += 1) {
          const key = keys[j];
          if (key === undefined) break;
          if (mergedCount >= MAX_KV_KEYS) break;
          merged[key] = obj[key];
          mergedCount += 1;
        }
      } else if (mergedCount < MAX_KV_KEYS) {
        merged[`arg${i}`] = r;
        mergedCount += 1;
      }
      if (mergedCount >= MAX_KV_KEYS) break;
    }
    const kv = toKv(merged);
    if (kv) tail = (tail ? `${tail} ` : " ") + kv;
  }

  const nsTag = `ns="${ns}"`;
  return `[${tsSP()} BRT] ${level} ${nsTag} ${head}${tail}`;
}

export function hijackConsole(ns = "server"): void {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  function proxy(level: "LOG" | "INFO" | "WARN" | "ERROR") {
    return (msg?: unknown, ...rest: unknown[]) => {
      const line = humanLine(level, ns, msg, rest);

      if (ACCESS_STDOUT) {
        if (level === "INFO") original.info(line);
        else if (level === "WARN") original.warn(line);
        else if (level === "ERROR") original.error(line);
        else original.log(line);
      }

      fs.appendFileSync(TRACE_FILE, `${line}\n`, { encoding: "utf8" });
    };
  }

  console.log = proxy("LOG");
  console.info = proxy("INFO");
  console.warn = proxy("WARN");
  console.error = proxy("ERROR");
}

export const patchConsole = hijackConsole;
