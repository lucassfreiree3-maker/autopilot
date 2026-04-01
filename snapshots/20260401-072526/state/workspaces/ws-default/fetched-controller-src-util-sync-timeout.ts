const DEFAULT_SYNC_TIMEOUT_MS = 60_000;

export function readSyncTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.SYNC_TIMEOUT_MS || "");
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_SYNC_TIMEOUT_MS;
  }

  return Math.floor(raw);
}

export { DEFAULT_SYNC_TIMEOUT_MS };
