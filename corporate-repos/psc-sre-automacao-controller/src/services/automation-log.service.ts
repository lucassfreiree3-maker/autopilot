import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { DateTime } from "luxon";

export interface ExecutionEntry {
  timestamp: string;
  level:
    | "LOG"
    | "INFO"
    | "WARN"
    | "ERROR"
    | "DEBUG"
    | "ACCESS"
    | "TRACE"
    | undefined;
  message: string | undefined;
  raw: string;
}

export type ExecutionOverallStatus =
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "UNKNOWN";

export interface ExecutionStatus {
  execId: string;
  status: ExecutionOverallStatus;
  lastUpdateAt: string;
  entries: ExecutionEntry[];
}

const SAO_PAULO_TZ = "America/Sao_Paulo";

const LINE_REGEX = /^\[(?<ts>[^\]]+)\]\s+(?:(?<level>[A-Z]+)\s+)?(?<rest>.*)$/;
const EXEC_ID_REGEX = /(?:\bexecId=|\buuid=)(?<id>[0-9a-fA-F-]{8,})\b/;
const EXEC_STATUS_REGEX =
  /\bexecStatus=(?<status>RUNNING|PENDING|DONE|ERROR)\b/i;

function buildLogPath(): string {
  const logsDir = String(process.env.LOGS_DIR || "").trim() || "logs";
  const fileName =
    String(process.env.TRACE_FILE_NAME || "").trim() || "automation-trace.log";

  return path.isAbsolute(logsDir)
    ? path.join(logsDir, fileName)
    : path.join(process.cwd(), logsDir, fileName);
}

function foldExecStatus(
  current: ExecutionOverallStatus,
  execStatus: string | undefined,
): ExecutionOverallStatus {
  const normalized = (execStatus || "").trim().toUpperCase();

  if (normalized === "ERROR") return "FAILED";
  if (normalized === "DONE") return "SUCCEEDED";
  if (normalized === "RUNNING" || normalized === "PENDING") {
    if (current === "FAILED" || current === "SUCCEEDED") return current;
    return "RUNNING";
  }

  return current;
}

function foldStatus(
  current: ExecutionOverallStatus,
  level: string | undefined,
  message: string | undefined,
  execStatus?: string,
): ExecutionOverallStatus {
  const fromExecStatus = foldExecStatus(current, execStatus);
  if (fromExecStatus !== current) return fromExecStatus;

  const msg = `${(level || "").toUpperCase()} ${(
    message || ""
  ).toUpperCase()}`.trim();

  if (msg.includes("FAILED") || msg.includes("ERROR")) return "FAILED";
  if (
    msg.includes("FINISHED") ||
    msg.includes("SUCCESS") ||
    msg.includes("SUCCEEDED")
  )
    return "SUCCEEDED";
  if (
    msg.includes("START") ||
    msg.includes("RUNNING") ||
    msg.includes("EXECUTION")
  )
    return "RUNNING";

  return current;
}

function readLines(file: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(file)) {
      resolve([]);
      return;
    }
    const out: string[] = [];
    const stream = fs.createReadStream(file, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => out.push(line));
    rl.once("close", () => resolve(out));
    rl.once("error", (err) => reject(err));
  });
}

export async function getExecutionStatusByExecId(
  execId: string,
): Promise<ExecutionStatus> {
  const entries: ExecutionEntry[] = [];
  let status: ExecutionOverallStatus = "UNKNOWN";
  let lastISO: DateTime | null = null;

  const lines = await readLines(buildLogPath());

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const m = LINE_REGEX.exec(line);

    if (m && m.groups) {
      const { ts, level, rest } = m.groups;
      const idMatch = EXEC_ID_REGEX.exec(rest);

      if (idMatch && idMatch.groups && idMatch.groups.id === execId) {
        const execStatusMatch = EXEC_STATUS_REGEX.exec(rest);
        const execStatus = execStatusMatch?.groups?.status;
        let tsLuxon: DateTime | null = null;
        const maybe = DateTime.fromFormat(ts, "dd/LL/yyyy HH:mm:ss 'BRT'", {
          zone: SAO_PAULO_TZ,
        });
        if (maybe.isValid) tsLuxon = maybe;

        if (!tsLuxon) {
          const parsed = DateTime.fromISO(ts, { zone: SAO_PAULO_TZ });
          tsLuxon = parsed.isValid
            ? parsed
            : DateTime.local().setZone(SAO_PAULO_TZ);
        }

        const formatted = tsLuxon
          .setZone(SAO_PAULO_TZ)
          .toFormat("dd/LL/yyyy HH:mm:ss 'BRT'");

        entries.push({
          timestamp: formatted,
          level: level as ExecutionEntry["level"],
          message: rest.trim(),
          raw: line,
        });

        status = foldStatus(status, level, rest, execStatus);
        if (!lastISO || tsLuxon > lastISO) lastISO = tsLuxon;
      }
    }
  }

  if (status === "UNKNOWN" && entries.length > 0) status = "RUNNING";

  const lastUpdateAt = (
    lastISO ?? DateTime.local().setZone(SAO_PAULO_TZ)
  ).toFormat("dd/LL/yyyy HH:mm:ss 'BRT'");

  return { execId, status, lastUpdateAt, entries };
}
