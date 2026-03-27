import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { uploadRotatedTraceGz, type RotatedTraceUploadResult } from "./s3logger";
import { isoDateToBrazilianDate, timestampSP } from "./time";

const LOG_DIR =
  process.env.LOGS_DIR && process.env.LOGS_DIR.trim() !== ""
    ? path.resolve(process.cwd(), process.env.LOGS_DIR)
    : path.join(process.cwd(), "logs");

const SRC_FILE = path.join(LOG_DIR, "automation-trace.log");
const ROTATED_DIR = path.join(LOG_DIR, "rotated");
const STATE_FILE = path.join(LOG_DIR, ".rotation-state.json");

type State = { offset: number; lastRanAt?: string };

async function ensureDirs(): Promise<void> {
  await fsp.mkdir(LOG_DIR, { recursive: true });
  await fsp.mkdir(ROTATED_DIR, { recursive: true });
}

async function loadState(): Promise<State> {
  try {
    const raw = await fsp.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      offset:
        typeof parsed.offset === "number" && parsed.offset >= 0
          ? parsed.offset
          : 0,
      lastRanAt:
        typeof parsed.lastRanAt === "string" && parsed.lastRanAt.trim() !== ""
          ? parsed.lastRanAt
          : undefined,
    };
  } catch {
    return { offset: 0 };
  }
}

async function saveState(state: State): Promise<void> {
  const finalState: State = {
    offset:
      typeof state.offset === "number" && state.offset >= 0 ? state.offset : 0,
    lastRanAt: state.lastRanAt ?? timestampSP(),
  };
  await fsp.writeFile(STATE_FILE, JSON.stringify(finalState, null, 2), "utf8");
}

function extractLogDate(line: string): string | null {
  const m = line.match(/\[(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeEnv(envRaw: string): "dev" | "hm" | "prod" {
  const v = (envRaw || "").toLowerCase().trim();
  if (v === "dev" || v === "des" || v === "desenvolvimento") return "dev";
  if (v === "hm" || v === "hml" || v === "homologacao" || v === "homolog")
    return "hm";
  return "prod";
}

export async function rotateAndCompress(envFromRequest: string): Promise<{
  bytesRead: number;
  linesRead: number;
  linesSkipped: number;
  filesWritten: number;
  files: string[];
  upload: {
    attempted: number;
    uploaded: number;
    skipped: number;
    failed: number;
    results: RotatedTraceUploadResult[];
  };
}> {
  await ensureDirs();

  const env = normalizeEnv(envFromRequest);
  const state = await loadState();

  const stat = await fsp.stat(SRC_FILE).catch(() => null as fs.Stats | null);
  if (!stat) {
    return {
      bytesRead: 0,
      linesRead: 0,
      linesSkipped: 0,
      filesWritten: 0,
      files: [],
      upload: {
        attempted: 0,
        uploaded: 0,
        skipped: 0,
        failed: 0,
        results: [],
      },
    };
  }

  const fileSize = stat.size;
  const offset = state.offset ?? 0;

  if (offset >= fileSize) {
    const newState: State = {
      offset: fileSize,
      lastRanAt: timestampSP(),
    };
    await saveState(newState);
    return {
      bytesRead: 0,
      linesRead: 0,
      linesSkipped: 0,
      filesWritten: 0,
      files: [],
      upload: {
        attempted: 0,
        uploaded: 0,
        skipped: 0,
        failed: 0,
        results: [],
      },
    };
  }

  const length = fileSize - offset;

  const handle = await fsp.open(SRC_FILE, "r");
  const u8 = new Uint8Array(length);
  await handle.read(u8, 0, length, offset);
  await handle.close();

  const chunkText = Buffer.from(u8).toString("utf8");
  const rawLines = chunkText.split(/\r?\n/);

  const groups = new Map<string, string[]>();
  let linesRead = 0;
  let linesSkipped = 0;

  rawLines.forEach((line) => {
    if (!line || !line.trim()) {
      return;
    }
    linesRead += 1;

    const dateISO = extractLogDate(line);
    if (!dateISO) {
      linesSkipped += 1;
      return;
    }

    const existing = groups.get(dateISO);
    if (existing) {
      existing.push(line);
    } else {
      groups.set(dateISO, [line]);
    }
  });

  const writtenFiles: string[] = [];
  const uploadResults: RotatedTraceUploadResult[] = [];
  const entries = Array.from(groups.entries());

  const promises = entries.map(async ([dateISO, lines]) => {
    const dateBR = isoDateToBrazilianDate(dateISO, "-") || dateISO;
    const fileName = `automation-trace-log-${dateBR}-${env}.gz`;
    const fullPath = path.join(ROTATED_DIR, fileName);

    const gzip = zlib.createGzip();
    const input = Readable.from(`${lines.join("\n")}\n`);

    const flags = await fsp
      .stat(fullPath)
      .then(() => "a" as const)
      .catch(() => "w" as const);

    const output = fs.createWriteStream(fullPath, { flags });

    await pipeline(input, gzip, output);

    const uploadResult = await uploadRotatedTraceGz(fileName, fullPath, dateISO);
    writtenFiles.push(fileName);
    uploadResults.push(uploadResult);
  });

  await Promise.all(promises);

  const newState: State = {
    offset: fileSize,
    lastRanAt: timestampSP(),
  };
  await saveState(newState);

  return {
    bytesRead: length,
    linesRead,
    linesSkipped,
    filesWritten: writtenFiles.length,
    files: writtenFiles,
    upload: {
      attempted: uploadResults.length,
      uploaded: uploadResults.filter((item) => item.status === "uploaded").length,
      skipped: uploadResults.filter((item) => item.status === "skipped").length,
      failed: uploadResults.filter((item) => item.status === "failed").length,
      results: uploadResults,
    },
  };
}

export async function cleanupOldArchives(
  retentionDays = Number(process.env.LOG_RETENTION_DAYS || 15),
): Promise<{ removed: number; retentionDays: number }> {
  await ensureDirs();

  const files = await fsp.readdir(ROTATED_DIR).catch(() => [] as string[]);
  const now = Date.now();
  const ms = retentionDays * 24 * 60 * 60 * 1000;

  let removed = 0;

  await Promise.all(
    files.map(async (f) => {
      if (!f.endsWith(".gz")) return;
      const p = path.join(ROTATED_DIR, f);
      const st = await fsp.stat(p).catch(() => null);
      if (st && now - st.mtimeMs > ms) {
        await fsp.unlink(p).catch(() => {
          // Best-effort cleanup.
        });
        removed += 1;
      }
    }),
  );

  return { removed, retentionDays };
}
