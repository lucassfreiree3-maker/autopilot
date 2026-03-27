import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("automation-log.service", () => {
  const originalLogsDir = process.env.LOGS_DIR;
  const originalTraceFileName = process.env.TRACE_FILE_NAME;

  let tempDir = "";

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "controller-trace-"));
    process.env.LOGS_DIR = tempDir;
    delete process.env.TRACE_FILE_NAME;
  });

  afterEach(() => {
    if (typeof originalLogsDir === "string") process.env.LOGS_DIR = originalLogsDir;
    else delete process.env.LOGS_DIR;

    if (typeof originalTraceFileName === "string") {
      process.env.TRACE_FILE_NAME = originalTraceFileName;
    } else {
      delete process.env.TRACE_FILE_NAME;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("recognizes appendTraceLine-style execStatus as a final success", async () => {
    const execId = "550e8400-e29b-41d4-a716-446655440000";
    const tracePath = path.join(tempDir, "automation-trace.log");

    fs.writeFileSync(
      tracePath,
      `[13/03/2026 09:35:40 BRT] SRC=agent FROM=agent agent-exec execId=${execId} execStatus=DONE message=done\n`,
      "utf8",
    );

    const { getExecutionStatusByExecId } = await import(
      "../../services/automation-log.service"
    );

    const result = await getExecutionStatusByExecId(execId);

    expect(result.status).toBe("SUCCEEDED");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.message).toContain("execStatus=DONE");
  });
});
