import fs from "node:fs";
import os from "node:os";
import path from "node:path";

jest.mock("../../util/s3logger", () => ({
  readExecutionSnapshot: jest.fn(async () => null),
  uploadExecutionSnapshot: jest.fn(async () => true),
  uploadTraceFile: jest.fn(async () => undefined),
}));

describe("waitForFinalExecution with shared trace state", () => {
  const originalLogsDir = process.env.LOGS_DIR;
  const originalTraceFileName = process.env.TRACE_FILE_NAME;
  const originalSyncPollInterval = process.env.SYNC_POLL_INTERVAL_MS;

  let tempDir = "";

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "controller-shared-trace-"));
    process.env.LOGS_DIR = tempDir;
    process.env.SYNC_POLL_INTERVAL_MS = "250";
    delete process.env.TRACE_FILE_NAME;
  });

  afterEach(() => {
    jest.useRealTimers();

    if (typeof originalLogsDir === "string") process.env.LOGS_DIR = originalLogsDir;
    else delete process.env.LOGS_DIR;

    if (typeof originalTraceFileName === "string") {
      process.env.TRACE_FILE_NAME = originalTraceFileName;
    } else {
      delete process.env.TRACE_FILE_NAME;
    }

    if (typeof originalSyncPollInterval === "string") {
      process.env.SYNC_POLL_INTERVAL_MS = originalSyncPollInterval;
    } else {
      delete process.env.SYNC_POLL_INTERVAL_MS;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("resolves from the trace file when the final callback lands on another pod", async () => {
    const execId = "550e8400-e29b-41d4-a716-446655440000";
    const tracePath = path.join(tempDir, "automation-trace.log");

    fs.writeFileSync(tracePath, "", "utf8");

    const mod = await import("../../controllers/agents-execute-logs.controller");

    mod.initExecution(execId);
    const waiter = mod.waitForFinalExecution(execId, 2000);

    fs.appendFileSync(
      tracePath,
      `[13/03/2026 09:35:40 BRT] SRC=agent FROM=agent agent-exec execId=${execId} execStatus=DONE message=done\n`,
      "utf8",
    );

    await jest.advanceTimersByTimeAsync(300);

    const result = await waiter;

    expect(result.timedOut).toBe(false);
    expect(result.snapshot.status).toBe("DONE");
    expect(result.snapshot.finished).toBe(true);
  });
});
