import {
  DEFAULT_SYNC_POLL_INTERVAL_MS,
  MAX_SYNC_POLL_INTERVAL_MS,
  MIN_SYNC_POLL_INTERVAL_MS,
  readSyncPollIntervalMs,
} from "../../util/sync-poll-interval";

describe("sync-poll-interval util", () => {
  test("returns default for invalid values", () => {
    expect(
      readSyncPollIntervalMs({
        SYNC_POLL_INTERVAL_MS: "invalid",
      } as NodeJS.ProcessEnv),
    ).toBe(DEFAULT_SYNC_POLL_INTERVAL_MS);
    expect(
      readSyncPollIntervalMs({
        SYNC_POLL_INTERVAL_MS: "0",
      } as NodeJS.ProcessEnv),
    ).toBe(DEFAULT_SYNC_POLL_INTERVAL_MS);
  });

  test("clamps values inside the supported interval window", () => {
    expect(
      readSyncPollIntervalMs({
        SYNC_POLL_INTERVAL_MS: "100",
      } as NodeJS.ProcessEnv),
    ).toBe(MIN_SYNC_POLL_INTERVAL_MS);
    expect(
      readSyncPollIntervalMs({
        SYNC_POLL_INTERVAL_MS: "5000",
      } as NodeJS.ProcessEnv),
    ).toBe(MAX_SYNC_POLL_INTERVAL_MS);
  });

  test("normalizes decimal values down to an integer", () => {
    expect(
      readSyncPollIntervalMs({
        SYNC_POLL_INTERVAL_MS: "432.9",
      } as NodeJS.ProcessEnv),
    ).toBe(432);
  });
});
