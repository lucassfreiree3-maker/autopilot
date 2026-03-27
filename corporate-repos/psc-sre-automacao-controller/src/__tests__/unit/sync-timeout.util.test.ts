import {
  DEFAULT_SYNC_TIMEOUT_MS,
  readSyncTimeoutMs,
} from "../../util/sync-timeout";

describe("sync-timeout util", () => {
  test("returns configured positive timeout", () => {
    expect(
      readSyncTimeoutMs({ SYNC_TIMEOUT_MS: "1234" } as NodeJS.ProcessEnv),
    ).toBe(1234);
  });

  test("falls back to default timeout for invalid values", () => {
    expect(
      readSyncTimeoutMs({ SYNC_TIMEOUT_MS: "invalid" } as NodeJS.ProcessEnv),
    ).toBe(DEFAULT_SYNC_TIMEOUT_MS);
    expect(
      readSyncTimeoutMs({ SYNC_TIMEOUT_MS: "0" } as NodeJS.ProcessEnv),
    ).toBe(DEFAULT_SYNC_TIMEOUT_MS);
  });

  test("normalizes decimal values down to an integer", () => {
    expect(
      readSyncTimeoutMs({ SYNC_TIMEOUT_MS: "4321.9" } as NodeJS.ProcessEnv),
    ).toBe(4321);
  });
});
