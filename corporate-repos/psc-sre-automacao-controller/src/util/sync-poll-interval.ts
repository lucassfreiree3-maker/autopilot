const DEFAULT_SYNC_POLL_INTERVAL_MS = 500;
const MIN_SYNC_POLL_INTERVAL_MS = 250;
const MAX_SYNC_POLL_INTERVAL_MS = 1000;

export function readSyncPollIntervalMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = Number(env.SYNC_POLL_INTERVAL_MS || "");
  if (!Number.isFinite(raw) || raw < 1) {
    return DEFAULT_SYNC_POLL_INTERVAL_MS;
  }

  return Math.min(
    MAX_SYNC_POLL_INTERVAL_MS,
    Math.max(MIN_SYNC_POLL_INTERVAL_MS, Math.floor(raw)),
  );
}

export {
  DEFAULT_SYNC_POLL_INTERVAL_MS,
  MIN_SYNC_POLL_INTERVAL_MS,
  MAX_SYNC_POLL_INTERVAL_MS,
};
