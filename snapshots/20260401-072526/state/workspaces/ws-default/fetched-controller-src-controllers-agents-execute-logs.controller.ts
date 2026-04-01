import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import fs from "node:fs";
import path from "node:path";
import { appendTraceLine } from "../util/logger";
import {
  readExecutionSnapshot as readExecutionSnapshotRemote,
  uploadExecutionSnapshot,
  uploadTraceFile,
} from "../util/s3logger";
import { timestampSP } from "../util/time";
import {
  getExecutionStatusByExecId,
  type ExecutionOverallStatus,
} from "../services/automation-log.service";
import { readSyncPollIntervalMs } from "../util/sync-poll-interval";

export type ExecStatus = "RUNNING" | "PENDING" | "DONE" | "ERROR";

export type LogEntry = {
  ts: string;
  reqId?: string;
  method?: string;
  path?: string;
  status?: number | string;
  durationMs?: number | string;
  ip?: string;
  xff?: string | null;
  ua?: string | null;
  referer?: string | null;
  execId?: string;
  execStatus?: ExecStatus;
  level?: string;
  step?: number;
  message?: string;
  data?: unknown;
  source?: string;
  from?: string;
};

export type AnyLogEntry = LogEntry | Record<string, unknown>;

export type ExecutionSnapshot = {
  ok: true;
  execId: string;
  status: ExecStatus;
  statusLabel: string;
  finished: boolean;
  lastUpdate: string;
  count: number;
  entries: AnyLogEntry[];
};

type ExecutionWaiter = {
  resolve: (snapshot: ExecutionSnapshot) => void;
  reject: (err: unknown) => void;
  timer?: NodeJS.Timeout;
};

type ExecutionState = {
  status: ExecStatus;
  entries: AnyLogEntry[];
  updatedAt: number;
  waiters: ExecutionWaiter[];
};

type CallbackClaims = {
  execId?: string;
  [k: string]: unknown;
};

type StatusAcc = {
  topStatus: ExecStatus;
  lastUpdateISO: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pickString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}

function pickNumber(
  obj: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = obj[key];
  return typeof v === "number" ? v : undefined;
}

function safe(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\r\n\t]+/g, " ").trim().slice(0, 300);
}

function traceMsg(parts: string[]): string {
  return parts.join(" ");
}

function pickExecStatus(
  obj: Record<string, unknown>,
  key: string,
): ExecStatus | undefined {
  const v = obj[key];
  if (typeof v !== "string") return undefined;
  const s = v.trim().toUpperCase();
  if (s === "RUNNING" || s === "PENDING" || s === "DONE" || s === "ERROR")
    return s;
  return undefined;
}

function summarizeStatus(entries: AnyLogEntry[]): {
  topStatus: ExecStatus;
  statusLabel: string;
  finished: boolean;
  lastUpdateISO: string;
} {
  const init: StatusAcc = {
    topStatus: "PENDING",
    lastUpdateISO: timestampSP(),
  };

  const computed = entries.reduce<StatusAcc>((acc, e) => {
    const rec = isRecord(e) ? e : {};
    const st =
      pickExecStatus(rec, "status") || pickExecStatus(rec, "execStatus");
    const ts = pickString(rec, "ts");
    const lastUpdateISO = ts || acc.lastUpdateISO;

    if (!st) return { topStatus: acc.topStatus, lastUpdateISO };
    if (acc.topStatus === "ERROR") return { topStatus: "ERROR", lastUpdateISO };
    if (st === "ERROR") return { topStatus: "ERROR", lastUpdateISO };
    if (acc.topStatus === "DONE") return { topStatus: "DONE", lastUpdateISO };
    if (st === "DONE") return { topStatus: "DONE", lastUpdateISO };
    if (st === "RUNNING") return { topStatus: "RUNNING", lastUpdateISO };

    return { topStatus: acc.topStatus, lastUpdateISO };
  }, init);

  const finished =
    computed.topStatus === "DONE" || computed.topStatus === "ERROR";

  let statusLabel = "Pending";
  if (computed.topStatus === "RUNNING") statusLabel = "Running";
  if (computed.topStatus === "DONE") statusLabel = "Done";
  if (computed.topStatus === "ERROR") statusLabel = "Error";

  return {
    topStatus: computed.topStatus,
    statusLabel,
    finished,
    lastUpdateISO: computed.lastUpdateISO,
  };
}

function statusLabelFor(status: ExecStatus): string {
  if (status === "RUNNING") return "Running";
  if (status === "DONE") return "Done";
  if (status === "ERROR") return "Error";
  return "Pending";
}

function mapTraceStatus(status: ExecutionOverallStatus): ExecStatus | undefined {
  if (status === "FAILED") return "ERROR";
  if (status === "SUCCEEDED") return "DONE";
  if (status === "RUNNING") return "RUNNING";
  return undefined;
}

function statusPriority(status: ExecStatus): number {
  if (status === "ERROR") return 4;
  if (status === "DONE") return 3;
  if (status === "RUNNING") return 2;
  return 1;
}

function preferStatus(current: ExecStatus, candidate?: ExecStatus): ExecStatus {
  if (!candidate) return current;
  return statusPriority(candidate) > statusPriority(current)
    ? candidate
    : current;
}

const execLogs = new Map<string, AnyLogEntry[]>();
const executionStore = new Map<string, ExecutionState>();

function snapshotsDir(): string {
  const baseDir = String(process.env.LOGS_DIR || "").trim() || "logs";
  const logsDir = path.isAbsolute(baseDir)
    ? baseDir
    : path.join(process.cwd(), baseDir);
  return path.join(logsDir, "execution-snapshots");
}

function normalizeExecIdForPath(execId: string): string {
  const normalized = execId.trim().replace(/[^A-Za-z0-9._-]+/g, "_");
  return normalized || "unknown";
}

function executionSnapshotPath(execId: string): string {
  return path.join(snapshotsDir(), `${normalizeExecIdForPath(execId)}.json`);
}

function parseComparableTime(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isFinishedStatus(status: ExecStatus): boolean {
  return status === "DONE" || status === "ERROR";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function ensureState(execId: string): ExecutionState {
  const key = execId.trim();
  const existing = executionStore.get(key);
  if (existing) return existing;
  const created: ExecutionState = {
    status: "PENDING",
    entries: [],
    updatedAt: Date.now(),
    waiters: [],
  };
  executionStore.set(key, created);
  execLogs.set(key, created.entries);
  return created;
}

function snapshotFromState(
  execId: string,
  state: ExecutionState,
): ExecutionSnapshot {
  const merged = state.entries.slice().reverse();
  const { topStatus, statusLabel, finished, lastUpdateISO } =
    summarizeStatus(merged);
  return {
    ok: true,
    execId,
    status: topStatus,
    statusLabel,
    finished,
    lastUpdate: lastUpdateISO,
    count: merged.length,
    entries: merged,
  };
}

function parseExecutionEntries(value: unknown): AnyLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => isRecord(entry)) as AnyLogEntry[];
}

function parsePersistedExecutionSnapshot(
  value: unknown,
): ExecutionSnapshot | null {
  if (!isRecord(value)) return null;

  const execId = pickString(value, "execId");
  if (!execId) return null;

  const entries = parseExecutionEntries(value.entries);
  const summary = summarizeStatus(entries);
  const status = pickExecStatus(value, "status") || summary.topStatus;
  const lastUpdate = pickString(value, "lastUpdate") || summary.lastUpdateISO;
  const countRaw = value.count;
  const count =
    typeof countRaw === "number" && Number.isFinite(countRaw)
      ? countRaw
      : entries.length;

  return {
    ok: true,
    execId,
    status,
    statusLabel: pickString(value, "statusLabel") || statusLabelFor(status),
    finished:
      typeof value.finished === "boolean"
        ? value.finished
        : isFinishedStatus(status),
    lastUpdate,
    count,
    entries,
  };
}

function snapshotScore(
  snapshot: ExecutionSnapshot,
): [number, number, number, number] {
  return [
    snapshot.finished ? 1 : 0,
    statusPriority(snapshot.status),
    snapshot.count,
    parseComparableTime(snapshot.lastUpdate),
  ];
}

function pickPreferredSnapshot(
  current: ExecutionSnapshot,
  candidate: ExecutionSnapshot | null,
): ExecutionSnapshot {
  if (!candidate || candidate.execId !== current.execId) {
    return current;
  }

  const currentScore = snapshotScore(current);
  const candidateScore = snapshotScore(candidate);

  for (let i = 0; i < currentScore.length; i += 1) {
    if (candidateScore[i] > currentScore[i]) {
      return candidate;
    }
    if (candidateScore[i] < currentScore[i]) {
      return current;
    }
  }

  return current;
}

function hydrateStateFromSnapshot(
  execId: string,
  snapshot: ExecutionSnapshot,
): ExecutionState {
  const state = ensureState(execId);
  state.status = snapshot.status;
  state.updatedAt = parseComparableTime(snapshot.lastUpdate) || Date.now();
  state.entries.length = 0;
  state.entries.push(...snapshot.entries.slice().reverse());
  execLogs.set(execId, state.entries);
  return state;
}

function dedupeEntries(entries: AnyLogEntry[]): AnyLogEntry[] {
  const seen = new Set<string>();
  const deduped: AnyLogEntry[] = [];

  entries.forEach((entry) => {
    const rec = isRecord(entry) ? entry : {};
    const key = [
      pickString(rec, "ts") || "",
      pickExecStatus(rec, "status") || "",
      pickExecStatus(rec, "execStatus") || "",
      pickString(rec, "level") || "",
      pickString(rec, "message") || "",
      pickString(rec, "raw") || "",
      pickString(rec, "source") || "",
      pickString(rec, "from") || "",
    ].join("|");

    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(entry);
  });

  return deduped;
}

function writeLocalExecutionSnapshot(snapshot: ExecutionSnapshot): void {
  const targetPath = executionSnapshotPath(snapshot.execId);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(
    targetPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );
}

function readLocalExecutionSnapshot(execId: string): ExecutionSnapshot | null {
  const targetPath = executionSnapshotPath(execId);
  if (!fs.existsSync(targetPath)) return null;

  try {
    const raw = fs.readFileSync(targetPath, "utf8");
    return parsePersistedExecutionSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function loadPersistedExecutionSnapshot(
  execId: string,
): Promise<ExecutionSnapshot | null> {
  const localSnapshot = readLocalExecutionSnapshot(execId);
  const remoteSnapshot = parsePersistedExecutionSnapshot(
    await readExecutionSnapshotRemote(execId),
  );

  if (!localSnapshot) return remoteSnapshot;
  return pickPreferredSnapshot(localSnapshot, remoteSnapshot);
}

async function persistExecutionSnapshotState(
  execId: string,
  state: ExecutionState,
): Promise<void> {
  const snapshot = snapshotFromState(execId, state);
  try {
    writeLocalExecutionSnapshot(snapshot);
  } catch {
    // Best effort local persistence; keep the request flow alive.
  }

  await uploadExecutionSnapshot(execId, snapshot).catch(() => false);
}

function resolveWaitersIfFinished(execId: string, state: ExecutionState): void {
  if (state.status !== "DONE" && state.status !== "ERROR") return;

  const snap = snapshotFromState(execId, state);
  const waiters = state.waiters.splice(0, state.waiters.length);
  waiters.forEach((w) => {
    if (w.timer) clearTimeout(w.timer);
    w.resolve(snap);
  });
}

export function initExecution(execId: string): void {
  const state = ensureState(execId);
  state.updatedAt = Date.now();
  if (state.entries.length === 0) {
    state.status = "PENDING";
  }
  persistExecutionSnapshotState(execId, state).catch(() => undefined);
}

function getMergedExecLogEntries(execId: string): AnyLogEntry[] {
  const buf = execLogs.get(execId) || [];
  return buf.slice().reverse();
}

function mergeTraceAndMemory(
  execId: string,
  traceEntries: LogEntry[],
): AnyLogEntry[] {
  const memEntries = getMergedExecLogEntries(execId);
  const merged: AnyLogEntry[] = [...traceEntries, ...memEntries];

  merged.sort((a, b) => {
    const ra = isRecord(a) ? a : {};
    const rb = isRecord(b) ? b : {};
    const da = typeof ra.ts === "string" ? ra.ts : "";
    const db = typeof rb.ts === "string" ? rb.ts : "";
    return db.localeCompare(da);
  });

  return dedupeEntries(merged);
}

export async function getExecutionSnapshot(
  execId: string,
): Promise<ExecutionSnapshot> {
  const traceStatus = await getExecutionStatusByExecId(execId);
  const traceEntries = traceStatus.entries.map((entry) => ({
    ts: entry.timestamp,
    level: entry.level,
    message: entry.message,
    raw: entry.raw,
    source: "trace",
  }));
  const merged = mergeTraceAndMemory(execId, traceEntries);
  const summary = summarizeStatus(merged);
  const topStatus = preferStatus(
    summary.topStatus,
    mapTraceStatus(traceStatus.status),
  );
  const hasMemoryEntries = (execLogs.get(execId) || []).length > 0;
  const lastUpdate =
    hasMemoryEntries || traceStatus.entries.length < 1
      ? summary.lastUpdateISO
      : traceStatus.lastUpdateAt;

  const currentSnapshot: ExecutionSnapshot = {
    ok: true,
    execId,
    status: topStatus,
    statusLabel: statusLabelFor(topStatus),
    finished: topStatus === "DONE" || topStatus === "ERROR",
    lastUpdate,
    count: merged.length,
    entries: merged,
  };

  const persistedSnapshot = await loadPersistedExecutionSnapshot(execId);
  const effectiveSnapshot = pickPreferredSnapshot(
    currentSnapshot,
    persistedSnapshot,
  );

  if (effectiveSnapshot !== currentSnapshot) {
    hydrateStateFromSnapshot(execId, effectiveSnapshot);
  }

  return effectiveSnapshot;
}

export async function waitForFinalExecution(
  execId: string,
  timeoutMs: number,
): Promise<{ timedOut: boolean; snapshot: ExecutionSnapshot }> {
  const state = ensureState(execId);

  if (state.status === "DONE" || state.status === "ERROR") {
    return { timedOut: false, snapshot: snapshotFromState(execId, state) };
  }

  const initialSnapshot = await getExecutionSnapshot(execId);
  if (initialSnapshot.finished) {
    return { timedOut: false, snapshot: initialSnapshot };
  }

  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000;
  const pollMs = readSyncPollIntervalMs(process.env);

  return new Promise((resolve) => {
    let settled = false;
    let pollTimer: NodeJS.Timeout | undefined;
    let waiter: ExecutionWaiter;

    const settle = (timedOut: boolean, snapshot: ExecutionSnapshot) => {
      if (settled) return;
      settled = true;

      if (waiter.timer) clearTimeout(waiter.timer);
      if (pollTimer) clearInterval(pollTimer);

      const idx = state.waiters.indexOf(waiter);
      if (idx >= 0) state.waiters.splice(idx, 1);

      resolve({ timedOut, snapshot });
    };

    waiter = {
      resolve: (snap: ExecutionSnapshot) => settle(false, snap),
      reject: () => undefined,
      timer: undefined,
    };

    waiter.timer = setTimeout(() => {
      getExecutionSnapshot(execId)
        .then((snap) => settle(true, snap))
        .catch(() => settle(true, snapshotFromState(execId, state)));
    }, ms);

    pollTimer = setInterval(() => {
      getExecutionSnapshot(execId)
        .then((snap) => {
          if (snap.finished) settle(false, snap);
        })
        .catch(() => undefined);
    }, pollMs);

    state.waiters.push(waiter);
  });
}

export async function pushAgentExecutionLogs(
  req: ExpressRequest,
  res: ExpressResponse,
) {
  const body = isRecord(req.body) ? req.body : {};
  const execId = typeof body.execId === "string" ? body.execId.trim() : "";

  const claimsRaw = (req as unknown as Record<string, unknown>)
    .agentCallbackJwt;
  const claims = isRecord(claimsRaw) ? (claimsRaw as CallbackClaims) : {};
  const claimExecId =
    typeof claims.execId === "string" ? claims.execId.trim() : "";

  if (claimExecId && claimExecId !== execId) {
    res.status(403).json({
      ok: false,
      title: "Forbidden",
      status: 403,
      detail: "execId mismatch",
    });
    return;
  }

  const entries = Array.isArray(body.entries)
    ? (body.entries as AnyLogEntry[])
    : [];

  const sourceRaw = typeof body.source === "string" ? body.source.trim() : "";
  const source = sourceRaw ? sourceRaw.toLowerCase() : "agent";

  const queryObj = isRecord(req.query) ? req.query : {};
  const queryFrom =
    typeof queryObj.from === "string" ? queryObj.from : undefined;

  const headerXFrom = req.header("x-from") ?? undefined;
  const headerFrom = req.header("from") ?? undefined;

  const fromBody = typeof body.from === "string" ? body.from : undefined;
  const from = fromBody || queryFrom || headerXFrom || headerFrom || "agent";

  if (!execId || entries.length < 1) {
    res.status(400).json({
      ok: false,
      title: "Bad Request",
      status: 400,
      detail:
        "Provide execId (string) and entries (array) with at least one item.",
    });
    return;
  }

  const state = ensureState(execId);
  const buf = state.entries;

  entries.forEach((e) => {
    const rec = isRecord(e) ? e : {};
    const ts = pickString(rec, "ts") ?? timestampSP();
    const levelRaw = pickString(rec, "level");
    const level = levelRaw ? levelRaw.toUpperCase() : undefined;
    const step = pickNumber(rec, "step");
    const messageRaw = pickString(rec, "message");
    const message = messageRaw ? decodeHtmlEntities(messageRaw) : undefined;
    const { data } = rec;

    const execStatus = pickExecStatus(rec, "status");
    const normalizedBase = message === undefined ? rec : { ...rec, message };
    const normalized = execStatus
      ? { ...normalizedBase, status: execStatus }
      : normalizedBase;

    buf.push(normalized);

    const statusVal =
      typeof rec.status === "number" || typeof rec.status === "string"
        ? rec.status
        : "-";
    const durationVal =
      typeof rec.durationMs === "number" ? rec.durationMs : "-";

    appendTraceLine(
      `SRC=${safe(source)} FROM=${safe(from)}`,
      traceMsg([
        "agent-exec",
        `execId=${safe(execId)}`,
        `ts=${safe(ts)}`,
        `reqId=${safe(pickString(rec, "reqId"))}`,
        `method=${safe(pickString(rec, "method"))}`,
        `path=${safe(pickString(rec, "path"))}`,
        `status=${safe(statusVal)}`,
        `durationMs=${safe(durationVal)}`,
        `execStatus=${safe(execStatus)}`,
        `level=${safe(level)}`,
        `step=${safe(step)}`,
        `message=${safe(message)}`,
        `dataType=${safe(typeof data)}`,
        `source=${safe(source)}`,
        `from=${safe(from)}`,
      ]),
    );
  });

  state.updatedAt = Date.now();
  const statusNow = summarizeStatus(buf).topStatus;
  state.status = statusNow;

  execLogs.set(execId, buf);
  await persistExecutionSnapshotState(execId, state);
  resolveWaitersIfFinished(execId, state);
  uploadTraceFile().catch(() => undefined);

  res
    .status(202)
    .json({ ok: true, received: entries.length, execId, from, source });
}

export async function getAgentExecutionLogs(
  req: ExpressRequest,
  res: ExpressResponse,
) {
  const queryObj = isRecord(req.query) ? req.query : {};
  const rawUuid = typeof queryObj.uuid === "string" ? queryObj.uuid.trim() : "";
  const rawExecId =
    typeof queryObj.execId === "string" ? queryObj.execId.trim() : "";

  const execId = rawUuid || rawExecId;

  if (rawUuid && rawExecId && rawUuid !== rawExecId) {
    res.status(400).json({
      ok: false,
      title: "Bad Request",
      status: 400,
      detail: "uuid and execId must match when both are provided.",
    });
    return;
  }

  if (!execId) {
    res.status(400).json({
      ok: false,
      title: "Bad Request",
      status: 400,
      detail: "Provide uuid (recommended) or execId (query string).",
    });
    return;
  }

  const payload = await getExecutionSnapshot(execId);

  const dayRaw = typeof queryObj.day === "string" ? queryObj.day.trim() : "";
  const dateFromRaw =
    typeof queryObj.dateFrom === "string" ? queryObj.dateFrom.trim() : "";
  const dateToRaw =
    typeof queryObj.dateTo === "string" ? queryObj.dateTo.trim() : "";
  const limitRaw =
    typeof queryObj.limit === "string" ? queryObj.limit.trim() : "";

  const hasTimeFilter = Boolean(dayRaw || dateFromRaw || dateToRaw);

  let fromMs: number | undefined;
  let toMs: number | undefined;

  if (dayRaw) {
    const start = new Date(`${dayRaw}T00:00:00-03:00`).getTime();
    const end = new Date(`${dayRaw}T23:59:59.999-03:00`).getTime();
    if (Number.isFinite(start) && Number.isFinite(end)) {
      fromMs = start;
      toMs = end;
    }
  }

  if (dateFromRaw) {
    const ms = new Date(dateFromRaw).getTime();
    if (Number.isFinite(ms)) fromMs = ms;
  }

  if (dateToRaw) {
    const ms = new Date(dateToRaw).getTime();
    if (Number.isFinite(ms)) toMs = ms;
  }

  const MAX_RESULTS = 1000;
  const limitParsed = Number(limitRaw);
  const limit =
    Number.isFinite(limitParsed) && limitParsed > 0
      ? Math.min(Math.floor(limitParsed), MAX_RESULTS)
      : MAX_RESULTS;

  const filtered = payload.entries.filter((e) => {
    if (!hasTimeFilter && !limit) return true;
    const rec = isRecord(e) ? e : {};
    const ts = typeof rec.ts === "string" ? rec.ts : "";
    if (!ts && hasTimeFilter) return false;
    const ms = ts ? new Date(ts).getTime() : NaN;
    if (!Number.isFinite(ms) && hasTimeFilter) return false;
    if (typeof fromMs === "number" && Number.isFinite(fromMs) && ms < fromMs)
      return false;
    if (typeof toMs === "number" && Number.isFinite(toMs) && ms > toMs)
      return false;
    return true;
  });

  const limited =
    typeof limit === "number" ? filtered.slice(0, limit) : filtered;

  res.status(200).json({
    ...payload,
    count: limited.length,
    entries: limited,
  });
}

export const getAgentExecutionStatus = getAgentExecutionLogs;
