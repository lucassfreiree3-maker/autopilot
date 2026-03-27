import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import {
  GetObjectCommand,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { formatDateSP, isoDateToBrazilianDate } from "./time";

const TRACE_DEBUG =
  String(process.env.TRACE_DEBUG ?? "").toLowerCase() === "true" ||
  process.env.TRACE_DEBUG === "1";

function env(name: string, def = ""): string {
  const v = process.env[name];
  return v && String(v).trim() !== "" ? String(v) : def;
}

function envAny(names: string[], def = ""): string {
  const found = names
    .map((name) => env(name, ""))
    .find((value) => value.trim() !== "");
  return found || def;
}

function boolEnv(name: string, def = false): boolean {
  const raw = env(name, "").trim().toLowerCase();
  if (!raw) return def;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}
function readFileTrim(p?: string): string {
  if (!p) return "";
  try {
    return fs.readFileSync(p, "utf8").trim();
  } catch {
    return "";
  }
}
function normalizeEndpoint(v: string): string {
  if (!v) return v;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `https://${v}`;
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function readSecret(names: string[], fileNames: string[]): string {
  const direct = envAny(names, "");
  if (direct.trim() !== "") return direct.trim();

  const filePath = envAny(fileNames, "");
  return readFileTrim(filePath);
}

function tracePrefix(): string {
  return (
    trimSlashes(
      envAny(
        ["TRACE_S3_PREFIX", "OSS_TRACE_PREFIX", "S3_TRACE_PREFIX"],
        "controller/automation-trace",
      ),
    ) || "controller/automation-trace"
  );
}

function requestsPrefix(): string {
  return trimSlashes(
    envAny(["OSS_REQUESTS_PREFIX", "S3_REQUESTS_PREFIX"], "controller/requests"),
  );
}

function executionSnapshotsPrefix(): string {
  return (
    trimSlashes(
      envAny(
        [
          "OSS_EXECUTION_SNAPSHOTS_PREFIX",
          "TRACE_EXECUTION_SNAPSHOTS_PREFIX",
          "S3_EXECUTION_SNAPSHOTS_PREFIX",
        ],
        "controller/execution-snapshots",
      ),
    ) || "controller/execution-snapshots"
  );
}

function bucketName(): string {
  return envAny(["OSS_BUCKET", "TRACE_S3_BUCKET", "S3_BUCKET"], "");
}

type S3ConfigState =
  | { ok: true }
  | { ok: false; reason: "missing_bucket" | "missing_credentials" };

function getS3ConfigState(): S3ConfigState {
  if (!bucketName()) {
    return { ok: false, reason: "missing_bucket" };
  }

  const accessKeyId = readSecret(
    ["OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY", "AWS_ACCESS_KEY_ID"],
    ["OSS_ACCESS_KEY_FILE", "AWS_ACCESS_KEY_ID_FILE", "S3_ACCESS_KEY_FILE"],
  );
  const secretAccessKey = readSecret(
    ["OSS_SECRET_ACCESS_KEY", "OSS_SECRET_KEY", "AWS_SECRET_ACCESS_KEY"],
    ["OSS_SECRET_KEY_FILE", "AWS_SECRET_ACCESS_KEY_FILE", "S3_SECRET_KEY_FILE"],
  );

  if (!accessKeyId || !secretAccessKey) {
    return { ok: false, reason: "missing_credentials" };
  }

  return { ok: true };
}

let s3ClientInstance: S3Client | null = null;

function getS3(): S3Client | null {
  if (s3ClientInstance) return s3ClientInstance;

  const endpoint = normalizeEndpoint(envAny(["OSS_ENDPOINT", "S3_ENDPOINT"], ""));
  const region = env("AWS_REGION", "us-east-1");
  const forcePathStyle =
    boolEnv("OSS_FORCE_PATH_STYLE", boolEnv("S3_FORCE_PATH_STYLE", true));

  const accessKeyId = readSecret(
    ["OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY", "AWS_ACCESS_KEY_ID"],
    ["OSS_ACCESS_KEY_FILE", "AWS_ACCESS_KEY_ID_FILE", "S3_ACCESS_KEY_FILE"],
  );
  const secretAccessKey = readSecret(
    ["OSS_SECRET_ACCESS_KEY", "OSS_SECRET_KEY", "AWS_SECRET_ACCESS_KEY"],
    ["OSS_SECRET_KEY_FILE", "AWS_SECRET_ACCESS_KEY_FILE", "S3_SECRET_KEY_FILE"],
  );

  if (!bucketName()) {
    if (TRACE_DEBUG)
      console.error("[s3logger] missing OSS_BUCKET; skipping S3 init");
    return null;
  }
  if (!accessKeyId || !secretAccessKey) {
    if (TRACE_DEBUG)
      console.error(
        "[s3logger] missing credentials from *_FILE; skipping S3 init",
      );
    return null;
  }

  const insecure =
    boolEnv("OSS_INSECURE_TLS", boolEnv("S3_INSECURE_TLS", false));
  const caBundlePath = envAny(["OSS_CA_BUNDLE", "S3_CA_BUNDLE"], "");

  let ca: Buffer | undefined;
  if (caBundlePath) {
    try {
      ca = fs.readFileSync(caBundlePath);
    } catch (e) {
      if (TRACE_DEBUG) console.error("[s3logger] read CA bundle FAIL", e);
    }
  }

  const httpsAgent = new https.Agent({ rejectUnauthorized: !insecure, ca });

  s3ClientInstance = new S3Client({
    endpoint: endpoint || undefined,
    region,
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
    requestHandler: new NodeHttpHandler({ httpsAgent }),
  });

  return s3ClientInstance;
}

function dayStamp(d = new Date()): string {
  return formatDateSP(d, "-");
}

async function putText(
  key: string,
  text: string,
  ct = "text/plain; charset=utf-8",
): Promise<void> {
  const s3 = getS3();
  if (!s3) return;
  const bucket = bucketName();
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: text,
        ContentType: ct,
      }),
    );
  } catch (err) {
    if (TRACE_DEBUG) console.error("[s3logger] putText FAIL", { key }, err);
    throw err;
  }
}

async function streamBodyToString(body: unknown): Promise<string> {
  if (!body) return "";

  const withTransform = body as { transformToString?: () => Promise<string> };
  if (typeof withTransform.transformToString === "function") {
    return withTransform.transformToString();
  }

  if (Buffer.isBuffer(body)) {
    return body.toString("utf8");
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString("utf8");
  }

  const stream = body as NodeJS.ReadableStream & {
    setEncoding?: (encoding: BufferEncoding) => void;
  };
  if (typeof stream.on === "function") {
    return new Promise((resolve, reject) => {
      let text = "";
      if (typeof stream.setEncoding === "function") {
        stream.setEncoding("utf8");
      }

      stream.on("data", (chunk: string | Uint8Array) => {
        text +=
          typeof chunk === "string"
            ? chunk
            : Buffer.from(chunk).toString("utf8");
      });
      stream.on("end", () => resolve(text));
      stream.on("error", (err) => reject(err));
    });
  }

  return String(body);
}

async function getText(key: string): Promise<string | null> {
  const configState = getS3ConfigState();
  if (!configState.ok) return null;

  const s3 = getS3();
  if (!s3) return null;

  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucketName(),
        Key: key,
      }),
    );

    return streamBodyToString(response.Body);
  } catch (err) {
    const statusCode =
      typeof err === "object" &&
      err !== null &&
      "statusCode" in err &&
      typeof (err as { statusCode?: unknown }).statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : undefined;
    const name =
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      typeof (err as { name?: unknown }).name === "string"
        ? (err as { name: string }).name
        : "";

    if (statusCode === 404 || name === "NoSuchKey" || name === "NotFound") {
      return null;
    }

    if (TRACE_DEBUG) console.error("[s3logger] getText FAIL", { key }, err);
    return null;
  }
}

async function putFile(
  key: string,
  filePath: string,
  ct = "text/plain; charset=utf-8",
): Promise<void> {
  const s3 = getS3();
  if (!s3) return;
  const bucket = bucketName();
  const body = await fs.promises.readFile(filePath);
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: ct,
      }),
    );
  } catch (err) {
    if (TRACE_DEBUG)
      console.error("[s3logger] putFile FAIL", { key, filePath }, err);
    throw err;
  }
}

export async function uploadRequestsLog(
  prefixOrText: string,
  data?: unknown,
): Promise<void> {
  try {
    let line = prefixOrText;
    if (typeof data !== "undefined") {
      try {
        line += ` ${JSON.stringify(data)}`;
      } catch {
        line += ` ${String(data)}`;
      }
    }
    await putText(`${requestsPrefix()}/${dayStamp()}/requests.log`, line);
  } catch (err) {
    if (TRACE_DEBUG) console.error("[s3logger] uploadRequestsLog FAIL", err);
  }
}

export type RotatedTraceUploadResult = {
  fileName: string;
  key: string;
  status: "uploaded" | "skipped" | "failed";
  reason?: "missing_bucket" | "missing_credentials" | "upload_failed";
  detail?: string;
};

export async function uploadRotatedTraceGz(
  fileName: string,
  fullPath: string,
  dateISO: string,
): Promise<RotatedTraceUploadResult> {
  const day = isoDateToBrazilianDate(dateISO, "-") || dayStamp();
  const key = `${tracePrefix()}/${day}/${fileName}`;
  const configState = getS3ConfigState();

  if (!configState.ok) {
    return {
      fileName,
      key,
      status: "skipped",
      reason: configState.reason,
    };
  }

  try {
    await putFile(key, fullPath, "application/gzip");
    return {
      fileName,
      key,
      status: "uploaded",
    };
  } catch (err) {
    if (TRACE_DEBUG)
      console.error(
        "[s3logger] uploadRotatedTraceGz FAIL",
        {
          fileName,
          fullPath,
          dateISO,
        },
        err,
      );
    return {
      fileName,
      key,
      status: "failed",
      reason: "upload_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function uploadTraceFile(filePath?: string): Promise<void> {
  try {
    const baseDir = env("LOGS_DIR", "./logs");
    const logsDir = path.isAbsolute(baseDir)
      ? baseDir
      : path.join(process.cwd(), baseDir);
    const local = filePath || path.join(logsDir, "automation-trace.log");
    const fixedKey = envAny(["S3_TRACE_KEY", "OSS_TRACE_KEY"], "").trim();
    const key =
      fixedKey !== ""
        ? fixedKey
        : `${tracePrefix()}/${dayStamp()}/automation-trace.log`;
    await putFile(key, local);
  } catch (err) {
    if (TRACE_DEBUG) console.error("[s3logger] uploadTraceFile FAIL", err);
  }
}

function normalizeObjectKeyPart(value: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9._-]+/g, "_");
  return normalized || "unknown";
}

function executionSnapshotKey(execId: string): string {
  return `${executionSnapshotsPrefix()}/${normalizeObjectKeyPart(execId)}.json`;
}

export async function uploadExecutionSnapshot(
  execId: string,
  snapshot: unknown,
): Promise<boolean> {
  const configState = getS3ConfigState();
  if (!configState.ok) {
    return false;
  }

  try {
    await putText(
      executionSnapshotKey(execId),
      JSON.stringify(snapshot),
      "application/json; charset=utf-8",
    );
    return true;
  } catch (err) {
    if (TRACE_DEBUG) {
      console.error("[s3logger] uploadExecutionSnapshot FAIL", { execId }, err);
    }
    return false;
  }
}

export async function readExecutionSnapshot(
  execId: string,
): Promise<Record<string, unknown> | null> {
  const payload = await getText(executionSnapshotKey(execId));
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (TRACE_DEBUG) {
      console.error("[s3logger] readExecutionSnapshot parse FAIL", { execId }, err);
    }
    return null;
  }
}

let traceDirty = false;
let traceInterval: ReturnType<typeof setInterval> | null = null;
const TRACE_FLUSH_INTERVAL_MS = 10_000;

export function notifyTraceChanged(): void {
  traceDirty = true;
  if (!traceInterval) {
    traceInterval = setInterval(() => {
      if (!traceDirty) return;
      traceDirty = false;
      uploadTraceFile().catch((err) => {
        if (TRACE_DEBUG)
          console.error("[s3logger] scheduled uploadTraceFile FAIL", err);
      });
    }, TRACE_FLUSH_INTERVAL_MS);
    traceInterval.unref();
  }
}

async function flushTraceIfNeeded(): Promise<void> {
  if (!traceDirty) return;
  traceDirty = false;
  try {
    await uploadTraceFile();
  } catch (err) {
    if (TRACE_DEBUG) console.error("[s3logger] flushTraceIfNeeded FAIL", err);
  }
}

process.once("beforeExit", () => {
  flushTraceIfNeeded().catch(() => {
    // Non-critical background flush; ignore errors.
  });
});
process.once("SIGINT", () => {
  flushTraceIfNeeded()
    .then(() => process.exit(0))
    .catch(() => process.exit(0));
});
process.once("SIGTERM", () => {
  flushTraceIfNeeded()
    .then(() => process.exit(0))
    .catch(() => process.exit(0));
});
